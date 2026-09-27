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
