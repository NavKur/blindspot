# AGENTS.md

This file provides guidance to agents when working with code in this repository.

## Stack

- **Language**: Python ≥3.10 (CPython + PyPy)
- **Package manager**: `uv` (lockfile: `uv.lock`)
- **Build backend**: Hatchling
- **Test runner**: pytest with plugins: `pytest-pycodestyle`, `pytest-cov`, `pytest-mypy`

## Commands

```bash
# Run all tests (includes pycodestyle lint + mypy type-check + coverage)
uv run pytest

# Run a single test file
uv run pytest tests/test_tinydb.py

# Run a single test by name
uv run pytest tests/test_tinydb.py::test_insert

# Run only type checks
uv run pytest --mypy tinydb/

# Run only style checks
uv run pytest --pycodestyle tinydb/
```

## Critical Non-Obvious Patterns

- **`pytest.ini` always appends coverage** (`--cov-append`): running pytest multiple times accumulates coverage across runs. Use `--no-cov` to suppress when only running a single test.
- **`pytest-mypy` skips PyPy** by design (see `pyproject.toml` marker `platform_python_implementation != 'PyPy'`).
- **`with_typehint()`** in [`tinydb/utils.py`](tinydb/utils.py) is a type-hint–only inheritance trick: at runtime it returns `object`; during type-checking it returns the given class. MyPy requires the custom plugin [`tinydb/mypy_plugin.py`](tinydb/mypy_plugin.py) to understand it — registered in `mypy.ini`.
- **`TinyDB` inherits from `TableBase`** (which is `with_typehint(Table)`) to gain all `Table` method signatures without actual class inheritance at runtime.
- **Query caching relies on `__hash__`**: any callable used as a query must have a stable hash. Use `freeze()` from [`tinydb/utils.py`](tinydb/utils.py) when building hashable query arguments from mutable types (dicts → `FrozenDict`, lists → tuples).
- **`QueryLike` is a `Protocol`** — to mark a custom query as non-cacheable, add an `is_cacheable()` method that returns `False`.
- **`CachingMiddleware` must be explicitly flushed/closed**: it batches up to 1000 writes before hitting disk; data loss occurs if `close()` or `flush()` is not called.
- **`Middleware.__call__` acts as constructor**: `TinyDB(storage=Middleware(StorageClass))` — the middleware is *already an instance* when passed to TinyDB; calling it again in `__call__` initialises the inner storage.
- **`conftest.py` fixture `db`** runs every test *twice* (parametrized `memory` and `json`). Tests that assume a specific storage type should use `MemoryStorage` or `JSONStorage` directly rather than the `db` fixture.
- **`Document` is a `dict` subclass** with `.doc_id`; `Table.insert()` will reuse the `doc_id` from a `Document` object and reset `_next_id`.
- **`__all__` is defined in every module** — keep it updated when adding public symbols.
- **Coverage config** (`.coveragerc`) excludes `__repr__`, `__str__`, `raise NotImplementedError`, and `warnings.warn` lines — no need to write tests for those.

## Code Style

- Style enforced by `pycodestyle` (PEP 8) via `pytest-pycodestyle` on every test run.
- Type annotations are required on all public API; `mypy` runs in strict mode via the plugin.
- Imports: stdlib first, then intra-package relative imports (e.g. `from .utils import freeze`).
- `__all__` tuples use parentheses, not brackets: `__all__ = ('Foo', 'Bar')`.
