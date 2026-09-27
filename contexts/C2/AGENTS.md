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

## Blindspot notes (facts checked against the code)

### `tinydb/storages.py` (tinydb.storages)

---

**Module:** `tinydb/storages.py`
**`__all__`:** `('Storage', 'JSONStorage', 'MemoryStorage')`

---

### Top-level function

[`touch(path: str, create_dirs: bool)`](tinydb/storages.py:16) — module-level, **not** a method.
Calls: `os.path.dirname`, `os.path.exists`, `os.makedirs`, `open`.
Raises: none explicitly.
No default values for either parameter.

---

### Class `Storage(ABC)`

Defined at the top level of the module (line 36). **It exists.** Bases: `ABC`.
Methods it defines:

- [`read(self) -> Optional[dict]`](tinydb/storages.py:48) — abstract; raises `NotImplementedError`. Parameters: `self` only.
- [`write(self, data: dict[str, dict[str, Any]]) -> None`](tinydb/storages.py:60) — abstract; raises `NotImplementedError`. Parameters: `self`, `data`.
- [`close(self) -> None`](tinydb/storages.py:71) — concrete no-op (`pass`); raises none.

---

### Class `JSONStorage(Storage)`

Bases: `Storage`.
Methods:

- [`__init__(self, path: str, create_dirs=False, encoding=None, access_mode='r+', **kwargs)`](tinydb/storages.py:84)
  Calls module-level `touch(path, create_dirs=create_dirs)` (only when access mode contains `+`, `w`, or `a`), then `open`. Issues `warnings.warn` for non-safe access modes. Raises: none explicitly.
- [`close(self) -> None`](tinydb/storages.py:122) — calls `self._handle.close()`. Raises: none.
- [`read(self) -> Optional[dict]`](tinydb/storages.py:125) — calls `self._handle.seek`, `self._handle.tell`, `json.load`. **Does NOT call `touch`** (that is in `__init__` only). Raises: none explicitly.
- [`write(self, data: dict)`](tinydb/storages.py:142) — calls `json.dumps`, `self._handle.seek/write/flush/truncate`, `os.fsync`. Catches `io.UnsupportedOperation` and re-raises as `IOError`. Raises: `IOError`.

Instance attributes set in `__init__`: `self._mode`, `self.kwargs`, `self._handle`.

---

### Class `MemoryStorage(Storage)`

Bases: `Storage`.
Methods:

- [`__init__(self)`](tinydb/storages.py:169) — sets `self.memory = None`. Raises: none.
- [`read(self) -> Optional[dict]`](tinydb/storages.py:177) — returns `self.memory`. Raises: none.
- [`write(self, data: dict)`](tinydb/storages.py:180) — sets `self.memory = data`. Raises: none.

---

### Names that do NOT exist but sound plausible

- `JSONStorage.flush` — no such method (flushing happens inside `write`).
- `JSONStorage.load` — no such method.
- `MemoryStorage.clear` — no such method.
- `Storage.open` — no such method.
- A method or argument named `create_file` — does not exist; the relevant parameter is `create_dirs`.
- `JSONStorage.read` does **not** call `touch`; only `__init__` does.
- `Storage` is **not** a plain class without a base; it inherits from `ABC`.

### `tinydb/database.py` (tinydb.database)

**Module `tinydb.database` — fact notes**

**Module-level names**
- Imports: `JSONStorage` (from `.`), `Storage` (from `.storages`), `Table`, `Document` (from `.table`), `with_typehint` (from `.utils`).
- `TableBase` = `with_typehint(Table)` — used only as the dynamic base for `TinyDB`.

---

**Class `TinyDB(TableBase)`**
`TableBase` is `with_typehint(Table)`, so `TinyDB`'s effective base is `Table`. No class named `TableBase` is user-defined here.

Class variables: `table_class = Table`, `default_table_name = '_default'`, `default_storage_class = JSONStorage`.

Methods defined **directly on `TinyDB`** (the complete list):
`__init__`, `__repr__`, `table`, `tables`, `drop_tables`, `drop_table`, `storage` *(property)*, `close`, `__enter__`, `__exit__`, `__getattr__`, `__len__`, `__iter__`.

**There is no method named `delete_table` anywhere in this file.** The drop methods are `drop_table` (single) and `drop_tables` (all). `delete_table` does not exist and is not inherited from anything in this file.

---

**Per-method details**

[`__init__(self, *args, **kwargs)`](tinydb/database.py:87) — pops `'storage'` from `kwargs` (default `self.default_storage_class`), creates `self._storage`, sets `self._opened = True`, `self._tables = {}`. Raises: none.

[`__repr__(self)`](tinydb/database.py:100) — calls `self.tables()`, `self.__len__()`, `self.table(table)`. Raises: none.

[`table(self, name: str, **kwargs) -> Table`](tinydb/database.py:111) — returns cached instance from `self._tables` if present; otherwise creates `self.table_class(self.storage, name, **kwargs)`, stores it, returns it. Calls the **property** `self.storage` (not a function named `storage`). Raises: none.

[`tables(self) -> set[str]`](tinydb/database.py:135) — returns `set(self.storage.read() or {})`. Calls `self.storage.read()` via the **`storage` property** (accesses `self._storage`). **No call to anything named `storage` as a standalone function.** Raises: none.

[`drop_tables(self) -> None`](tinydb/database.py:163) — calls `self.storage.write({})`, then `self._tables.clear()`. Raises: none.

[`drop_table(self, name: str) -> None`](tinydb/database.py:176) — calls `self.storage.read()`, conditionally `self.storage.write(data)`. Returns early (silently) if storage data is `None` or `name` not in data. Raises: none.

[`storage` (property)](tinydb/database.py:204) — returns `self._storage`. Raises: none.

[`close(self) -> None`](tinydb/database.py:214) — sets `self._opened = False`, calls `self.storage.close()`. Raises: none.

[`__enter__(self)`](tinydb/database.py:232) — returns `self`. Raises: none.

[`__exit__(self, *args)`](tinydb/database.py:244) — calls `self.close()` only if `self._opened` is truthy. Raises: none.

[`__getattr__(self, name)`](tinydb/database.py:251) — forwards to `getattr(self.table(self.default_table_name), name)`. Raises: none in its own body (unknown attribute on the default table would raise `AttributeError` from `getattr`).

[`__len__(self)`](tinydb/database.py:260) — returns `len(self.table(self.default_table_name))`. Raises: none.

[`__iter__(self) -> Iterator[Document]`](tinydb/database.py:270) — returns `iter(self.table(self.default_table_name))`. Raises: none.

---

**Plausible names that do NOT exist in this file**
- `delete_table` — does not exist; the correct names are `drop_table` / `drop_tables`.
- `get_table`, `create_table`, `remove_table` — none present.
- `open()` — no such method; opening happens in `__init__`.
- `_default_table` — no such attribute; the string name is `default_table_name = '_default'`.
- `tables()` does **not** call a standalone function named `storage`; it uses the `self.storage` property, which returns `self._storage`.

### `tinydb/table.py` (tinydb.table)

Here are the verified notes on [`tinydb/table.py`](D:\blindspot\.cache\carto_ws\tinydb\table.py):

---

**Module:** `tinydb.table` — `__all__ = ('Document', 'Table')`

---

**Class `Document`** — bases: `dict`
- [`__init__(self, value: Mapping, doc_id: int)`](D:\blindspot\.cache\carto_ws\tinydb\table.py:30) — calls `super().__init__(value)`, sets `self.doc_id`. Raises: none.

---

**Class `Table`** — bases: `object`
Class variables: `document_class = Document`, `document_id_class = int`, `query_cache_class = LRUCache`, `default_query_cache_capacity = 10`.

Methods defined on `Table`:

- [`__init__(self, storage, name, cache_size=default_query_cache_capacity, persist_empty=False)`](D:\blindspot\.cache\carto_ws\tinydb\table.py:94) — **`persist_empty` defaults to `False`**, not `True`. Raises: none.
- [`__repr__(self)`](D:\blindspot\.cache\carto_ws\tinydb\table.py:114) — Raises: none.
- [`name`](D:\blindspot\.cache\carto_ws\tinydb\table.py:124) / [`storage`](D:\blindspot\.cache\carto_ws\tinydb\table.py:131) — `@property`. Raise: none.
- [`insert(self, document)`](D:\blindspot\.cache\carto_ws\tinydb\table.py:137) — raises `ValueError` (two paths: not a Mapping; duplicate doc_id). Defines inner `updater`.
- [`insert_multiple(self, documents)`](D:\blindspot\.cache\carto_ws\tinydb\table.py:177) — raises `ValueError` inside inner `updater`. Defines inner `updater`.
- [`all(self)`](D:\blindspot\.cache\carto_ws\tinydb\table.py:221) — returns `list(iter(self))`. Raises: none.
- [`search(self, cond)`](D:\blindspot\.cache\carto_ws\tinydb\table.py:235) — uses `_query_cache`, calls `_read_table()`. Raises: none.
- [`get(self, cond=None, doc_id=None, doc_ids=None)`](D:\blindspot\.cache\carto_ws\tinydb\table.py:317) — **raises `RuntimeError('You have to pass either cond or doc_id or doc_ids')`** when all three args are `None`. Does NOT call `contains`. Has 8 `@overload` stubs above the real implementation.
- [`contains(self, cond=None, doc_id=None)`](D:\blindspot\.cache\carto_ws\tinydb\table.py:380) — calls `self.get(...)` only; **raises `RuntimeError('You have to pass either cond or doc_id')`** when both args are `None`. Does NOT call anything named `contains`.
- [`update(self, fields, cond=None, doc_ids=None)`](D:\blindspot\.cache\carto_ws\tinydb\table.py:404) — defines inner `perform_update` and `updater`. Raises: none directly (inner functions do not raise).
- [`update_multiple(self, updates)`](D:\blindspot\.cache\carto_ws\tinydb\table.py:508) — defines inner `perform_update` and `updater`. Raises: none.
- [`upsert(self, document, cond=None)`](D:\blindspot\.cache\carto_ws\tinydb\table.py:560) — raises `ValueError` if no `doc_id` and `cond` is None. Calls `self.update(...)` then `self.insert(...)`.
- [`remove(self, cond=None, doc_ids=None)`](D:\blindspot\.cache\carto_ws\tinydb\table.py:602) — **raises `RuntimeError('Use truncate() to remove all documents')`** when both args are `None`. Defines inner `updater`.
- [`truncate(self)`](D:\blindspot\.cache\carto_ws\tinydb\table.py:675) — calls `_update_table(lambda table: table.clear())`, resets `_next_id`. Raises: none.
- [`count(self, cond)`](D:\blindspot\.cache\carto_ws\tinydb\table.py:686) — one line: `return len(self.search(cond))`. **Calls `self.search`, NOT `self.contains`.** No inner helpers. Raises: none.
- [`clear_cache(self)`](D:\blindspot\.cache\carto_ws\tinydb\table.py:695) — calls `self._query_cache.clear()`. Raises: none.
- [`__len__(self)`](D:\blindspot\.cache\carto_ws\tinydb\table.py:702) — returns `len(self._read_table())`. Raises: none.
- [`__iter__(self)`](D:\blindspot\.cache\carto_ws\tinydb\table.py:709) — yields `document_class` objects. Raises: none.
- [`_get_next_id(self)`](D:\blindspot\.cache\carto_ws\tinydb\table.py:721) — private; computes next int ID using `max()`. Raises: none.
- [`_read_table(self)`](D:\blindspot\.cache\carto_ws\tinydb\table.py:756) — calls `self._storage.read()`; returns `{}` if storage is None or table key missing. Raises: none itself.
- [`_update_table(self, updater)`](D:\blindspot\.cache\carto_ws\tinydb\table.py:781) — reads, applies `updater(table)`, writes back, calls `self.clear_cache()`. Raises: none itself.

---

**Names that do NOT exist but sound plausible:**
`find`, `query`, `fetch`, `delete`, `add`, `upsert_multiple`, `get_by_id`, `count_all`, `Table.filter`, `Table.first`, `Document.id` (the attribute is `doc_id`, not `id`). There is no `Table.find()` or `Table.query()` method.

### `tinydb/queries.py` (tinydb.queries)

## `tinydb.queries` — module notes

**Module-level names exported:** `Query`, `QueryLike`, `where`; also defines `QueryInstance` and `is_sequence` (not in `__all__`).

---

### `is_sequence(obj)` — params: `obj`; raises: none; calls `hasattr`.

---

### `QueryLike` — bases: `Protocol`
Protocol stub only; defines `__call__(self, value: Mapping) -> bool` and `__hash__(self) -> int`. No implementation bodies. No methods raise anything.

---

### `QueryInstance` — bases: `object`
Methods it defines: `__init__`, `is_cacheable`, `__call__`, `__hash__`, `__repr__`, `__eq__`, `__and__`, `__or__`, `__invert__`.

- [`__init__(self, test: Callable[[Mapping], bool], hashval: Optional[tuple])`](tinydb/queries.py:73) — raises: none (catches `TypeError` internally and sets `hashval = None`; never re-raises).
- [`is_cacheable(self)`](tinydb/queries.py:84) — raises: none.
- [`__call__(self, value: Mapping)`](tinydb/queries.py:87) — raises: none directly; delegates to `self._test`.
- [`__hash__(self)`](tinydb/queries.py:96) — raises: none.
- [`__repr__(self)`](tinydb/queries.py:102) — raises: none.
- [`__eq__(self, other: object)`](tinydb/queries.py:105) — raises: none.
- [`__and__(self, other: QueryInstance)`](tinydb/queries.py:113) — raises: none; hash uses `frozenset`.
- [`__or__(self, other: QueryInstance)`](tinydb/queries.py:123) — raises: none; hash uses `frozenset`.
- [`__invert__(self)`](tinydb/queries.py:133) — raises: none.

---

### `Query` — bases: `QueryInstance`
Methods it defines: `__init__`, `__repr__`, `__hash__`, `__getattr__`, `__getitem__`, `_generate_test`, `__eq__`, `__ne__`, `__lt__`, `__le__`, `__gt__`, `__ge__`, `exists`, `matches`, `search`, `test`, `any`, `all`, `one_of`, `fragment`, `noop`, `map`.

- [`__init__(self) -> None`](tinydb/queries.py:171) — no parameters beyond `self`. **Defines an inner function `notest(_)` that contains `raise RuntimeError('Empty query was evaluated')`. This `raise` lives inside `Query.__init__`'s own scope (a nested helper), so `Query.__init__` itself does contain a `raise RuntimeError` statement.** Raises: `RuntimeError` (deferred — fires when `notest` is called on an unevaluated empty query).
- [`__getattr__(self, item: str)`](tinydb/queries.py:190) — raises: none.
- [`__getitem__(self, item: str)`](tinydb/queries.py:204) — raises: none; delegates to `self.__getattr__`.
- [`_generate_test(self, test, hashval, allow_empty_path=False)`](tinydb/queries.py:215) — raises: `ValueError('Query has no path')` when `self._path` is falsy and `allow_empty_path` is `False`.
- Comparison methods `__eq__`, `__ne__`, `__lt__`, `__le__`, `__gt__`, `__ge__` — params: `(self, rhs: Any)`; all call `_generate_test`; raise: none directly.
- [`exists(self)`](tinydb/queries.py:329) — params: `self`; raises: none directly.
- [`matches(self, regex: str, flags: int = 0)`](tinydb/queries.py:340) — raises: none directly; calls `re.match`.
- [`search(self, regex: str, flags: int = 0)`](tinydb/queries.py:357) — raises: none directly; calls `re.search`.
- [`test(self, func: Callable, *args)`](tinydb/queries.py:376) — raises: none directly; calls `freeze` on each arg.
- [`any(self, cond: Union[QueryInstance, list])`](tinydb/queries.py:401) — raises: none directly; calls built-in `any` and `is_sequence`.
- [`all(self, cond: Union[QueryInstance, list])`](tinydb/queries.py:436) — raises: none directly; calls built-in `all` and `is_sequence`.
- [`one_of(self, items: list)`](tinydb/queries.py:469) — raises: none directly.
- [`fragment(self, document: Mapping)`](tinydb/queries.py:482) — raises: none directly; passes `allow_empty_path=True` so it works without a field path.
- [`noop(self)`](tinydb/queries.py:496) — raises: none; returns a `QueryInstance` that always returns `True`.
- [`map(self, fn: Callable)`](tinydb/queries.py:508) — raises: none; sets `query._hash = None` (always non-cacheable).

---

### `where(key: str) -> Query` (module-level function)
Raises: none. Simply returns `Query()[key]`.

---

**Names that do NOT exist but sound plausible:** `Query.contains`, `Query.startswith`, `Query.endswith`, `Query.has`, `Query.where`, `Query.regex`, `Query.not_`, `QueryInstance.test` (it's on `Query`, not `QueryInstance`), `Query.path` (the attribute is `_path`, not `path`).

### `tinydb/utils.py` (tinydb.utils)

## `tinydb.utils` — module notes

**Exports:** `LRUCache`, `freeze`, `with_typehint` (from `__all__`). `FrozenDict` is defined but not exported.

---

### `with_typehint(baseclass: type[T])`
- Parameters: `baseclass` — no default.
- Returns `baseclass` when `TYPE_CHECKING` is `True`; otherwise returns `object`.
- Raises: none.
- Purpose: a type-hint shim so `class Foo(with_typehint(Bar))` tricks type-checkers into treating `Foo` as a subclass of `Bar` at analysis time only.

---

### `class LRUCache(abc.MutableMapping, Generic[K, V])`
Bases: [`collections.abc.MutableMapping`](tinydb/utils.py:39), `Generic[K, V]`.
Methods **defined in this class**: `__init__`, `lru` (property), `length` (property), `clear`, `__len__`, `__contains__`, `__setitem__`, `__delitem__`, `__getitem__`, `__iter__`, `get`, `set`.

- [`__init__(self, capacity=None)`](tinydb/utils.py:53) — raises none; stores `capacity`; initialises `self.cache` as `OrderedDict`.
- [`lru(self)`](tinydb/utils.py:58) — property; raises none; returns `list(self.cache.keys())`.
- [`length(self)`](tinydb/utils.py:62) — property; raises none; returns `len(self.cache)`.
- [`clear(self)`](tinydb/utils.py:65) — raises none.
- [`__len__(self)`](tinydb/utils.py:68) — raises none; delegates to `self.length`.
- [`__contains__(self, key: object)`](tinydb/utils.py:71) — raises none.
- [`__setitem__(self, key, value)`](tinydb/utils.py:74) — raises none; delegates to `self.set(key, value)`.
- [`__delitem__(self, key)`](tinydb/utils.py:77) — raises none explicitly; `del self.cache[key]` propagates `KeyError` from `OrderedDict`.
- [`__getitem__(self, key)`](tinydb/utils.py:80) — raises `KeyError(key)` when `get` returns `None`.
- **[`__iter__(self)`](tinydb/utils.py:87) — defined directly in `LRUCache`; raises none; returns `iter(self.cache)`.** (This method exists on the class itself, not only via inheritance.)
- [`get(self, key, default=None)`](tinydb/utils.py:90) — raises none; calls `self.cache.move_to_end(key, last=True)` on a cache hit.
- [`set(self, key, value)`](tinydb/utils.py:100) — raises none; evicts oldest entry via `self.cache.popitem(last=False)` only when `capacity is not None` and `self.length > self.capacity`.

**Important:** `__getitem__` raises `KeyError` only when `get()` returns `None`; a cached value that actually *is* `None` would also raise `KeyError` (a subtle bug/limitation).

---

### `class FrozenDict(dict)`
Base: `dict`.
Methods defined in this class: `__hash__`, `_immutable`, `update`, `pop`.
Attributes overriding dict mutators via assignment: `__setitem__`, `__delitem__`, `clear`, `setdefault`, `popitem` — all set to `_immutable`.

- [`__hash__(self)`](tinydb/utils.py:123) — raises none; returns `hash(tuple(sorted(self.items())))`.
- [`_immutable(self, *args, **kws)`](tinydb/utils.py:127) — raises `TypeError('object is immutable')`.
- [`update(self, e=None, **f)`](tinydb/utils.py:137) — raises `TypeError('object is immutable')`.
- [`pop(self, k, d=None)`](tinydb/utils.py:140) — raises `TypeError('object is immutable')`.

---

### `freeze(obj)`
- Parameters: `obj` — no default.
- Raises: none.
- Recursively converts: `dict` → `FrozenDict`, `list` → `tuple`, `tuple` → `tuple` (elements also frozen), `set` → `frozenset`; all other types returned as-is.

---

### Names that do NOT exist but sound plausible
- `LRUCache.evict()` — no such method; eviction happens inside `set()`.
- `LRUCache.size` — no such attribute; use the `capacity` attribute or `length` property.
- `LRUCache.items_lru()` — no such method; use the `lru` property.
- `FrozenDict.freeze()` — no such method on the class; use the module-level `freeze()`.
- `unfreeze()` — no such function in this module.
