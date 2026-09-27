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
