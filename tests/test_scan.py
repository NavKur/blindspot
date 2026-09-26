import textwrap

from blindspot import scan

PKG = {
    "pkg/__init__.py": "from .core import Engine\n",
    "pkg/utils.py": """
        import os

        def helper(x, retries=3, *, name="h", flag=None, cb=len):
            if x < 0:
                raise ValueError("negative")
            return os.path.join(str(x), name)
    """,
    "pkg/core.py": """
        from . import utils
        from .utils import helper
        from typing import Optional

        class EngineError(Exception):
            pass

        class Engine(object):
            def __init__(self, path, indent=4):
                self.path = path

            def run(self, n=0):
                def inner():
                    raise KeyError("only inside inner")
                try:
                    return helper(n)
                except ValueError:
                    raise
                finally:
                    self._close()
                raise EngineError("bad")

            def _close(self):
                pass
    """,
}


def make_pkg(tmp_path):
    for rel, src in PKG.items():
        p = tmp_path / rel
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(textwrap.dedent(src))
    return scan.scan_repo(tmp_path, "pkg")


def by_module(index):
    return {m["module"]: m for m in index["modules"]}


def test_module_names_and_imports(tmp_path):
    mods = by_module(make_pkg(tmp_path))
    assert set(mods) == {"pkg", "pkg.utils", "pkg.core"}
    assert mods["pkg"]["internal_imports"] == ["pkg.core"]              # relative import from __init__
    assert mods["pkg.core"]["internal_imports"] == ["pkg", "pkg.utils"]  # `from . import utils` resolves to pkg
    assert "typing" in mods["pkg.core"]["imports"] and "typing" not in mods["pkg.core"]["internal_imports"]


def test_defaults_keep_only_literals(tmp_path):
    mods = by_module(make_pkg(tmp_path))
    helper = mods["pkg.utils"]["functions"][0]
    assert helper["defaults"] == {"retries": "3", "name": "'h'", "flag": "None"}   # cb=len is not a literal
    assert helper["params"] == ["x", "retries", "name", "flag", "cb"]


def test_raises_include_inner_helpers_and_skip_bare_reraise(tmp_path):
    mods = by_module(make_pkg(tmp_path))
    run = [m for m in mods["pkg.core"]["classes"][1]["methods"] if m["qualname"] == "Engine.run"][0]
    assert run["raises"] == ["EngineError", "KeyError"]   # inner() helper counts; bare `raise` ignored
    assert set(run["calls"]) >= {"helper", "_close", "EngineError"}
    assert run["entity"] == "pkg.core:Engine.run"


def test_classes_and_entities(tmp_path):
    index = make_pkg(tmp_path)
    core = by_module(index)["pkg.core"]
    assert [c["qualname"] for c in core["classes"]] == ["EngineError", "Engine"]
    assert core["classes"][1]["bases"] == ["object"]
    init = core["classes"][1]["methods"][0]
    assert init["defaults"] == {"indent": "4"}
    assert len(scan.all_functions(index)) == 4     # helper, __init__, run, _close
