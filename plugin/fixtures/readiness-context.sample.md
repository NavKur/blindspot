# What Bob should know about tinydb (sample)

- Table.update(): with no condition it updates every document. It does not raise ValueError.
- Table.update_multiple() exists. There is no update_all().
- Almost every Table method reads data through Table._read_table().
- Query.search() matches anywhere in the string; Query.matches() only from the start.
- Query.fragment() exists: it matches documents that contain a given set of fields.
- CachingMiddleware.write() saves automatically once the write cache is full; close() flushes before closing.
