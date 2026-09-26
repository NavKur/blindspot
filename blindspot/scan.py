"""Step 5: scan the target repo and build an index of facts the exam can ask about.

Everything here comes from Python's own parser (ast). Nothing is guessed and no AI is used,
so every fact in the index is ground truth for marking.

For each module we record:
  - lines of code (for the treemap)
  - which modules it imports
  - every function, class and method, with a stable "entity" id used for clustering
  - for each function: literal default values, exceptions it raises itself, names it calls
"""
import ast
import json
import sys
from pathlib import Path

from blindspot import config

SKIP = object()  # marker for a default that is not a plain literal


def module_name(path: Path, root: Path) -> str:
    """tinydb/table.py -> tinydb.table ; tinydb/__init__.py -> tinydb"""
    parts = list(path.relative_to(root).with_suffix("").parts)
    if parts[-1] == "__init__":
        parts = parts[:-1]
    return ".".join(parts)


def resolve_import(node: ast.ImportFrom, current: str, is_package: bool) -> str:
    """Turn `from .utils import x` inside tinydb.table into 'tinydb.utils'."""
    if node.level == 0:
        return node.module or ""
    base = current.split(".")
    if not is_package:
        base = base[:-1]                       # a plain module's package is its parent
    if node.level > 1:
        base = base[: len(base) - (node.level - 1)]
    return ".".join(base + ([node.module] if node.module else []))


def walk_body(node):
    """Walk a function body, including helper functions defined inside it, but not nested classes.

    tinydb (like much real code) raises from small inner helpers, e.g. Table.insert raises
    ValueError from its inner `updater`. Calling insert() can raise ValueError, so a question
    "can Table.insert raise ValueError?" should be marked True. Nested classes are separate
    entities, so we stop there."""
    stack = list(ast.iter_child_nodes(node))
    while stack:
        child = stack.pop()
        yield child
        if isinstance(child, ast.ClassDef):
            continue
        stack.extend(ast.iter_child_nodes(child))


def literal_or_skip(node):
    try:
        return ast.literal_eval(node)
    except (ValueError, TypeError, SyntaxError, MemoryError, RecursionError):
        return SKIP


def defaults_of(fn: ast.FunctionDef) -> dict:
    """Parameter name -> repr(default), literal defaults only (None, numbers, strings, tuples...)."""
    out = {}
    a = fn.args
    positional = a.posonlyargs + a.args
    for arg, default in zip(positional[len(positional) - len(a.defaults):], a.defaults):
        value = literal_or_skip(default)
        if value is not SKIP:
            out[arg.arg] = repr(value)
    for arg, default in zip(a.kwonlyargs, a.kw_defaults):
        if default is not None:
            value = literal_or_skip(default)
            if value is not SKIP:
                out[arg.arg] = repr(value)
    return out


def exception_name(exc) -> str:
    target = exc.func if isinstance(exc, ast.Call) else exc
    if isinstance(target, ast.Name):
        return target.id
    if isinstance(target, ast.Attribute):
        return target.attr
    return ""


def raises_of(fn) -> list:
    names = {exception_name(n.exc) for n in walk_body(fn) if isinstance(n, ast.Raise) and n.exc is not None}
    return sorted(n for n in names if n)


def calls_of(fn) -> list:
    names = set()
    for n in walk_body(fn):
        if isinstance(n, ast.Call):
            f = n.func
            if isinstance(f, ast.Name):
                names.add(f.id)
            elif isinstance(f, ast.Attribute):
                names.add(f.attr)
    return sorted(names)


def function_record(fn, module: str, qualname: str, kind: str) -> dict:
    return {
        "module": module,
        "qualname": qualname,
        "entity": f"{module}:{qualname}",
        "kind": kind,                      # function | method
        "line": fn.lineno,
        "params": [a.arg for a in fn.args.posonlyargs + fn.args.args + fn.args.kwonlyargs],
        "defaults": defaults_of(fn),
        "raises": raises_of(fn),
        "calls": calls_of(fn),
    }


def scan_module(path: Path, root: Path) -> dict:
    source = path.read_text(encoding="utf-8")
    tree = ast.parse(source, filename=str(path))
    name = module_name(path, root)
    is_package = path.name == "__init__.py"

    imports = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            imports.update(alias.name for alias in node.names)
        elif isinstance(node, ast.ImportFrom):
            resolved = resolve_import(node, name, is_package)
            if resolved:
                imports.add(resolved)

    functions, classes = [], []
    for node in tree.body:
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            functions.append(function_record(node, name, node.name, "function"))
        elif isinstance(node, ast.ClassDef):
            methods = [function_record(item, name, f"{node.name}.{item.name}", "method")
                       for item in node.body if isinstance(item, (ast.FunctionDef, ast.AsyncFunctionDef))]
            classes.append({
                "module": name, "qualname": node.name, "entity": f"{name}:{node.name}",
                "line": node.lineno, "bases": [ast.unparse(b) for b in node.bases], "methods": methods,
            })

    return {
        "module": name,
        "path": path.relative_to(root).as_posix(),
        "entity": f"{name}:<module>",
        "loc": sum(1 for line in source.splitlines() if line.strip()),
        "imports": sorted(imports),
        "functions": functions,
        "classes": classes,
    }


def scan_repo(root: Path, package: str) -> dict:
    root = Path(root)
    files = sorted((root / package).rglob("*.py"))
    modules = [scan_module(f, root) for f in files]
    internal = {m["module"] for m in modules}
    for m in modules:
        m["internal_imports"] = sorted(i for i in m["imports"]
                                       if i in internal or any(i.startswith(x + ".") for x in internal))
    return {"package": package, "modules": modules}


def all_functions(index: dict) -> list:
    """Every function and method in the index, flattened."""
    out = []
    for m in index["modules"]:
        out.extend(m["functions"])
        for c in m["classes"]:
            out.extend(c["methods"])
    return out


def summary_rows(index: dict) -> list:
    rows = []
    for m in index["modules"]:
        fns = m["functions"] + [meth for c in m["classes"] for meth in c["methods"]]
        rows.append({
            "module": m["module"], "loc": m["loc"], "classes": len(m["classes"]),
            "functions": len(m["functions"]), "methods": sum(len(c["methods"]) for c in m["classes"]),
            "literal_defaults": sum(len(f["defaults"]) for f in fns),
            "raising_fns": sum(1 for f in fns if f["raises"]),
            "internal_imports": len(m["internal_imports"]),
        })
    return rows


def main() -> int:
    lock = json.loads(config.TARGET_LOCK.read_text(encoding="utf-8")) if config.TARGET_LOCK.exists() else {}
    package = lock.get("package", "tinydb")
    if not (config.TARGET_DIR / package).exists():
        print("Target not found. Run `python cli.py target` first.")
        return 1
    index = scan_repo(config.TARGET_DIR, package)
    index["commit"] = lock.get("commit")
    config.EXAMS_DIR.mkdir(exist_ok=True)
    out = config.EXAMS_DIR / "index.json"
    out.write_text(json.dumps(index, indent=2), encoding="utf-8")

    rows = summary_rows(index)
    cols = ["module", "loc", "classes", "functions", "methods", "literal_defaults", "raising_fns", "internal_imports"]
    widths = [max(len(c), *(len(str(r[c])) for r in rows)) for c in cols]
    print("  ".join(c.ljust(w) for c, w in zip(cols, widths)))
    for r in rows:
        print("  ".join(str(r[c]).ljust(w) for c, w in zip(cols, widths)))
    print(f"\n{len(rows)} modules, {len(all_functions(index))} functions/methods. Saved to {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
