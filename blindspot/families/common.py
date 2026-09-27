"""Shared helpers for question families."""
import hashlib

from blindspot import config


def make_question(family, subkind, module, path, entity, qtype, text, truth, **extra) -> dict:
    """One exam question. `truth` is the machine-checked answer:
    True/False for qtype 'tf', or repr() of a Python literal for qtype 'value'."""
    qid = "q" + hashlib.sha1(f"{family}|{text}".encode()).hexdigest()[:10]
    q = {"id": qid, "family": family, "subkind": subkind, "module": module, "path": path,
         "entity": entity, "type": qtype, "text": text, "truth": truth}
    q.update(extra)
    return q


def exam_modules(index: dict) -> list:
    """Modules that get questions: big enough and not excluded."""
    return [m for m in index["modules"]
            if m["loc"] >= config.MIN_MODULE_LOC and m["module"] not in config.EXCLUDE_MODULES]


def class_table(index: dict) -> dict:
    """(module, class name) -> class record, for every class in the package."""
    return {(m["module"], c["qualname"]): c for m in index["modules"] for c in m["classes"]}


def methods_including_inherited(index: dict, module: str, cls: dict, _seen=None) -> set:
    """Method names a class defines itself or inherits from classes in the same package.
    Bases outside the package (e.g. dict, MutableMapping) are handled by the caller."""
    seen = _seen or set()
    names = {m["qualname"].split(".", 1)[1] for m in cls["methods"]}
    table = class_table(index)
    by_simple_name = {}
    for (mod, cname), c in table.items():
        by_simple_name.setdefault(cname, []).append((mod, c))
    for base in cls["bases"]:
        simple = base.split(".")[-1].split("[")[0]
        for mod, base_cls in by_simple_name.get(simple, []):
            key = (mod, base_cls["qualname"])
            if key not in seen:
                seen.add(key)
                names |= methods_including_inherited(index, mod, base_cls, seen)
    return names
