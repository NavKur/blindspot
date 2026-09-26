"""Family 2: existence. "Does file F define X?" Half real names, half fakes of three kinds:

  misplaced : a real name from a DIFFERENT module (realistic confusion about where things live)
  near_miss : a plausible method name on a real class, e.g. Table.fetch instead of Table.get
  mutation  : a mechanically altered real name (easiest fakes; kept to a small share in step 8)

Fakes must be truly absent, including via inheritance inside the package and via common
built-in bases (dict, list, MutableMapping...), otherwise the "truth" would be wrong.
"""
import collections.abc
import random

from blindspot import config
from blindspot.families.common import exam_modules, make_question, methods_including_inherited

FAMILY = "exists"

SYNONYMS = {
    "get": ["fetch", "find_one", "lookup"], "search": ["find", "query", "filter"],
    "insert": ["add", "put", "append"], "insert_multiple": ["add_many", "insert_many", "bulk_insert"],
    "update": ["modify", "patch", "set"], "update_multiple": ["update_many", "bulk_update"],
    "remove": ["delete", "discard", "drop"], "all": ["list_all", "get_all", "dump"],
    "contains": ["has", "exists", "includes"], "count": ["size", "total", "length"],
    "truncate": ["clear", "reset", "wipe"], "close": ["shutdown", "disconnect", "release"],
    "read": ["load", "fetch_all"], "write": ["save", "flush", "persist"],
    "table": ["get_table", "open_table", "collection"], "tables": ["list_tables", "table_names"],
    "drop_table": ["delete_table", "remove_table"], "drop_tables": ["delete_tables", "purge"],
    "upsert": ["insert_or_update", "merge"], "clear_cache": ["flush_cache", "reset_cache", "invalidate"],
}

# Names any class may have through common built-in bases; never used as fakes.
BUILTIN_ATTRS = set(dir(object)) | set(dir(dict)) | set(dir(list))
for abc_cls in (collections.abc.MutableMapping, collections.abc.Mapping, collections.abc.Sequence):
    BUILTIN_ATTRS |= set(dir(abc_cls))


def _mutate(name: str, rng) -> str:
    parts = name.strip("_").split("_")
    options = [
        lambda p: p[::-1] if len(p) > 1 else p + ["impl"],
        lambda p: p + ["all"],
        lambda p: ["do"] + p,
        lambda p: p[:-1] + [p[-1] + "s"] if not p[-1].endswith("s") else p[:-1] + [p[-1][:-1]],
    ]
    prefix = "_" if name.startswith("_") else ""
    return prefix + "_".join(rng.choice(options)(parts[:]))


def _top_level(m) -> dict:
    names = {f["qualname"]: f for f in m["functions"]}
    names.update({c["qualname"]: c for c in m["classes"]})
    return names


def generate(index: dict, seed: int = config.SEED) -> list:
    rng = random.Random(seed)
    out = []
    modules = exam_modules(index)
    all_top = {m["module"]: _top_level(m) for m in index["modules"]}

    for m in modules:
        path, mod = m["path"], m["module"]
        top = all_top[mod]

        # Real: top-level functions and classes, and methods (asked as Class.method)
        for name, rec in sorted(top.items()):
            kind = "class" if "methods" in rec else "function"
            out.append(make_question(FAMILY, "real", mod, path, rec["entity"], "tf",
                                     f"Does `{path}` define a top-level {kind} named `{name}`?", True, name=name))
        for c in m["classes"]:
            for meth in c["methods"]:
                mname = meth["qualname"].split(".", 1)[1]
                out.append(make_question(FAMILY, "real", mod, path, meth["entity"], "tf",
                                         f"Does the class `{c['qualname']}` in `{path}` have a method named "
                                         f"`{mname}` (defined in the class itself or inherited from a class in this package)?",
                                         True, name=meth["qualname"]))

        # Misplaced: real top-level names from other modules that do not exist here
        for other, names in sorted(all_top.items()):
            if other == mod:
                continue
            for name, rec in sorted(names.items()):
                if name in top or name.startswith("_"):
                    continue
                kind = "class" if "methods" in rec else "function"
                out.append(make_question(FAMILY, "misplaced", mod, path, m["entity"], "tf",
                                         f"Does `{path}` define a top-level {kind} named `{name}`?", False,
                                         name=name, really_in=other))

        # Near-miss and mutation: fake methods on real classes
        for c in m["classes"]:
            owned = methods_including_inherited(index, mod, c)
            external_bases = [b for b in c["bases"] if b not in ("object",)]
            forbidden = owned | (BUILTIN_ATTRS if external_bases else set(dir(object)))
            for meth in c["methods"]:
                mname = meth["qualname"].split(".", 1)[1]
                for fake in SYNONYMS.get(mname, []):
                    if fake not in forbidden:
                        out.append(make_question(FAMILY, "near_miss", mod, path, c["entity"], "tf",
                                                 f"Does the class `{c['qualname']}` in `{path}` have a method named "
                                                 f"`{fake}` (defined in the class itself or inherited from a class in this package)?",
                                                 False, name=f"{c['qualname']}.{fake}", derived_from=mname))
                if mname.startswith("__"):
                    continue
                fake = _mutate(mname, rng)
                if fake not in forbidden and fake != mname:
                    out.append(make_question(FAMILY, "mutation", mod, path, c["entity"], "tf",
                                             f"Does the class `{c['qualname']}` in `{path}` have a method named "
                                             f"`{fake}` (defined in the class itself or inherited from a class in this package)?",
                                             False, name=f"{c['qualname']}.{fake}", derived_from=mname))
    return out
