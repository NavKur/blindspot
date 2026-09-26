import textwrap

from blindspot import config, scan
from blindspot.families import defaults, exists, imports
from blindspot.generate import build_candidates

PKG = {
    "pkg/__init__.py": "from .table import Table\n" + "\n" * 12,
    "pkg/utils.py": """
        from collections.abc import MutableMapping

        def freeze(obj, deep=True):
            return obj

        class LRUCache(MutableMapping):
            def __init__(self, capacity=None):
                self.capacity = capacity
            def __getitem__(self, k): return k
            def __setitem__(self, k, v): pass
            def __delitem__(self, k): pass
            def __iter__(self): return iter([])
            def __len__(self): return 0
            def clear_cache(self): pass
    """,
    "pkg/table.py": """
        from .utils import freeze

        class BaseTable:
            def get(self, doc_id=None):
                return None

        class Table(BaseTable):
            def __init__(self, name, cache_size=10, persist=False):
                self.name = name
            def insert(self, doc):
                return 1
            def remove(self, cond=None):
                pass
    """,
}


def index_for(tmp_path):
    for rel, src in PKG.items():
        p = tmp_path / rel
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(textwrap.dedent(src))
    return scan.scan_repo(tmp_path, "pkg")


def test_imports_truth(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "MIN_MODULE_LOC", 1)
    qs = imports.generate(index_for(tmp_path))
    truth = {(q["module"], q["target"]): q["truth"] for q in qs}
    assert truth[("pkg.table", "pkg.utils")] is True
    assert truth[("pkg.utils", "pkg.table")] is False
    assert truth[("pkg", "pkg.table")] is True
    assert all(q["target"] != "pkg" for q in qs)            # bare package is never a target


def test_defaults_are_exact_literals(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "MIN_MODULE_LOC", 1)
    qs = {(q["entity"], q["param"]): q["truth"] for q in defaults.generate(index_for(tmp_path))}
    assert qs[("pkg.table:Table.__init__", "cache_size")] == "10"
    assert qs[("pkg.table:Table.__init__", "persist")] == "False"
    assert qs[("pkg.utils:freeze", "deep")] == "True"
    assert qs[("pkg.utils:LRUCache.__init__", "capacity")] == "None"


def test_exists_real_and_fakes_are_correct(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "MIN_MODULE_LOC", 1)
    qs = exists.generate(index_for(tmp_path))
    real = {q["name"] for q in qs if q["subkind"] == "real"}
    assert {"Table", "BaseTable", "Table.insert", "LRUCache.clear_cache", "freeze"} <= real
    assert all(q["truth"] is True for q in qs if q["subkind"] == "real")
    assert all(q["truth"] is False for q in qs if q["subkind"] != "real")

    fakes = {q["name"] for q in qs if q["subkind"] != "real"}
    assert "Table.get" not in fakes              # inherited from BaseTable, so never a fake
    assert "LRUCache.clear" not in fakes         # exists via MutableMapping, so never a fake
    assert "LRUCache.pop" not in fakes
    assert "Table.fetch" in fakes or "Table.add" in fakes   # near-miss synonyms of get/insert

    misplaced = [q for q in qs if q["subkind"] == "misplaced"]
    assert any(q["module"] == "pkg.utils" and q["name"] == "Table" for q in misplaced)
    assert not any(q["module"] == "pkg.table" and q["name"] == "Table" for q in misplaced)


def test_excluded_and_tiny_modules_get_no_questions(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "MIN_MODULE_LOC", 1)
    monkeypatch.setattr(config, "EXCLUDE_MODULES", ("pkg.utils",))
    qs = build_candidates(index_for(tmp_path))
    assert not any(q["module"] == "pkg.utils" for q in qs)


def test_ids_unique_and_stable(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "MIN_MODULE_LOC", 1)
    idx = index_for(tmp_path)
    a, b = build_candidates(idx), build_candidates(idx)
    assert [q["id"] for q in a] == [q["id"] for q in b]
    assert len({q["id"] for q in a}) == len(a)


def test_imports_skip_reexport_ambiguity(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "MIN_MODULE_LOC", 1)
    (tmp_path / "pkg").mkdir()
    (tmp_path / "pkg" / "__init__.py").write_text("from .storages import Storage\n")
    (tmp_path / "pkg" / "storages.py").write_text("class Storage:\n    pass\n")
    (tmp_path / "pkg" / "mw.py").write_text("from pkg import Storage\n\nclass M(Storage):\n    pass\n")
    qs = imports.generate(scan.scan_repo(tmp_path, "pkg"))
    assert not any(q["module"] == "pkg.mw" and q["target"] == "pkg.storages" for q in qs)
