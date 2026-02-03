# Firestore Indexes

## aiThreads scopeKey index

Create a composite index for aiThreads list queries:

- Collection: aiThreads
- Fields:
  - uid ASC
  - scopeKey ASC
  - updatedAt DESC

This supports:

- where(uid == ...)
- where(scopeKey == ...)
- orderBy(updatedAt desc)

If you see `firestore_missing_index` from `/api/ai/threads`, create this index in Firebase Console.
