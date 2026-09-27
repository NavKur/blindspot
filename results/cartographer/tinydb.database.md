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
