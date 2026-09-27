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
