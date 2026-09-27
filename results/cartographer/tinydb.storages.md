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
