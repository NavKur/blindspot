import textwrap

from blindspot import config, scan
from blindspot.families import calls, raises

PKG = {
    "pkg/__init__.py": "",
    "pkg/store.py": """
        class Store:
            def read(self):
                if not self._ok():
                    raise IOError("broken")
                return self._load()

            def _load(self):
                raise KeyError("missing")

            def _ok(self):
                return True

            def write(self, data):
                def check():
                    if data is None:
                        raise ValueError("no data")
                check()
                self.cache.get("x")
    """,
}


def index_for(tmp_path):
    for rel, src in PKG.items():
        p = tmp_path / rel
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(textwrap.dedent(src))
    return scan.scan_repo(tmp_path, "pkg")


def test_raises_truth_and_one_hop_skip(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "MIN_MODULE_LOC", 1)
    qs = raises.generate(index_for(tmp_path))
    t = {(q["entity"].split(":")[1], q["exception"]): q["truth"] for q in qs}
    assert t[("Store.read", "IOError")] is True
    assert t[("Store.write", "ValueError")] is True          # raised in an inner helper
    assert ("Store.read", "KeyError") not in t               # _load (called by read) raises it: skipped
    assert t[("Store._ok", "KeyError")] is False
    assert t[("Store.write", "RuntimeError")] is False


def test_calls_truth_and_ambiguous_names_skipped(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "MIN_MODULE_LOC", 1)
    qs = calls.generate(index_for(tmp_path))
    t = {(q["entity"].split(":")[1], q["callee"]): q["truth"] for q in qs}
    assert t[("Store.read", "_load")] is True
    assert t[("Store.read", "_ok")] is True
    assert t[("Store.read", "write")] is False
    assert t[("Store._load", "_ok")] is False
    assert not any(callee == "get" for _, callee in t)       # dict.get vs package get: ambiguous, skipped
    assert ("Store.read", "read") not in t                   # never ask whether f calls itself
