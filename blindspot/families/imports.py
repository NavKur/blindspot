"""Family 1: imports. "Does file A import from module B?" (true/false)"""
from blindspot.families.common import exam_modules, make_question

FAMILY = "imports"


def generate(index: dict) -> list:
    package = index["package"]
    modules = exam_modules(index)
    targets = [m["module"] for m in index["modules"] if m["module"] != package]   # skip the bare package
    reexported = next((set(m["internal_imports"]) for m in index["modules"] if m["module"] == package), set())
    out = []
    for m in modules:
        for target in targets:
            if target == m["module"]:
                continue
            # Ambiguous case: `from tinydb import Storage` really gets Storage from tinydb.storages via the
            # package's re-export. "Does it import from tinydb.storages?" has no clean answer, so skip it.
            if package in m["internal_imports"] and target in reexported and target not in m["internal_imports"]:
                continue
            truth = target in m["internal_imports"]
            text = (f"Does the file `{m['path']}` contain an import statement that imports from "
                    f"the module `{target}` (including relative imports such as `from .x import y`)?")
            out.append(make_question(FAMILY, "true" if truth else "false", m["module"], m["path"],
                                     m["entity"], "tf", text, truth, target=target))
    return out
