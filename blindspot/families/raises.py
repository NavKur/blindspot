"""Family 4: raises. "Does function f contain a raise statement for exception E?" (true/false)

True: E is raised in f's own code (including helper functions defined inside f).
False: E is raised somewhere else in the package, or is a common built-in exception,
       and is NOT raised by f. To avoid trick questions, we also skip an E that a function
       f calls directly (inside the package) raises: a reader could fairly think f "raises" it.
"""
from blindspot.families.common import exam_modules, make_question

FAMILY = "raises"
COMMON = ("TypeError", "KeyError", "ValueError", "RuntimeError", "IndexError", "NotImplementedError")


def _all_functions(index):
    for m in index["modules"]:
        for f in m["functions"]:
            yield m, f
        for c in m["classes"]:
            for f in c["methods"]:
                yield m, f


def generate(index: dict) -> list:
    raised_by_simple_name = {}
    pool = set(COMMON)
    for _, f in _all_functions(index):
        simple = f["qualname"].split(".")[-1]
        raised_by_simple_name.setdefault(simple, set()).update(f["raises"])
        pool.update(f["raises"])

    exam = {m["module"] for m in exam_modules(index)}
    out = []
    for m, f in _all_functions(index):
        if m["module"] not in exam:
            continue
        one_hop = set()
        for callee in f["calls"]:
            one_hop |= raised_by_simple_name.get(callee, set())
        kind = "method" if f["kind"] == "method" else "function"
        for exc in sorted(pool):
            if exc in f["raises"]:
                truth, subkind = True, "true"
            elif exc in one_hop:
                continue
            else:
                truth, subkind = False, "false"
            text = (f"Does the {kind} `{f['qualname']}` in `{m['path']}` contain a `raise` statement for "
                    f"`{exc}` in its own code (counting helper functions defined inside it, "
                    f"but not other functions it calls)?")
            out.append(make_question(FAMILY, subkind, m["module"], m["path"], f["entity"], "tf",
                                     text, truth, exception=exc))
    return out
