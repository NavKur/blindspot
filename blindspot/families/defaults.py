"""Family 3: defaults. "What is the default value of parameter p in function f?" (exact value)"""
from blindspot.families.common import exam_modules, make_question

FAMILY = "defaults"


def generate(index: dict) -> list:
    out = []
    for m in exam_modules(index):
        fns = m["functions"] + [meth for c in m["classes"] for meth in c["methods"]]
        for fn in fns:
            for param, value in sorted(fn["defaults"].items()):
                kind = "method" if fn["kind"] == "method" else "function"
                text = (f"In `{m['path']}`, what is the default value of the parameter `{param}` of the "
                        f"{kind} `{fn['qualname']}`? Answer with the exact Python literal, e.g. None, 0, 'abc'.")
                out.append(make_question(FAMILY, "value", m["module"], m["path"], fn["entity"],
                                         "value", text, value, param=param))
    return out
