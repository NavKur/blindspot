"""Family 5: calls. "Does function f call something named g?" (true/false)

Only names defined in the package are asked about (e.g. `_read_table`, `freeze`), and names that
are also common built-in methods (get, items, update...) are skipped, because `x.get()` could be
dict.get rather than the package's own get.
True: f's code contains a call to g. False: g is another package name from the same class
or module that f does not call.
"""
import builtins

from blindspot.families.common import exam_modules, make_question
from blindspot.families.exists import BUILTIN_ATTRS

FAMILY = "calls"
AMBIGUOUS = BUILTIN_ATTRS | set(dir(builtins))


def _package_names(index) -> set:
    names = set()
    for m in index["modules"]:
        names.update(f["qualname"] for f in m["functions"])
        for c in m["classes"]:
            names.add(c["qualname"])
            names.update(meth["qualname"].split(".", 1)[1] for meth in c["methods"])
    return {n for n in names if n not in AMBIGUOUS and not (n.startswith("__") and n.endswith("__"))}


def generate(index: dict) -> list:
    askable = _package_names(index)
    out = []
    for m in exam_modules(index):
        module_names = {f["qualname"] for f in m["functions"]} | {c["qualname"] for c in m["classes"]}
        groups = [(None, m["functions"])] + [(c, c["methods"]) for c in m["classes"]]
        for cls, fns in groups:
            siblings = {f["qualname"].split(".")[-1] for f in fns}
            neighbourhood = (siblings | module_names) & askable
            for f in fns:
                called = set(f["calls"]) & askable
                own = f["qualname"].split(".")[-1]
                kind = "method" if f["kind"] == "method" else "function"
                for target in sorted(called | (neighbourhood - {own})):
                    truth = target in called
                    text = (f"Does the code of the {kind} `{f['qualname']}` in `{m['path']}` (counting helper "
                            f"functions defined inside it) contain a call to something named `{target}`?")
                    out.append(make_question(FAMILY, "true" if truth else "false", m["module"], m["path"],
                                             f["entity"], "tf", text, truth, callee=target))
    return out
