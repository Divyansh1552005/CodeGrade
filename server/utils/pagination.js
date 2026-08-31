// Cursor-based (keyset) pagination helpers, paired with a `{ createdAt: -1,
// _id: -1 }` sort. Opaque cursors avoid offset pagination's "skip N" cost,
// which gets linearly slower as a collection grows.

export function decodeCursor(raw) {
  if (!raw) return null;
  try {
    const { createdAt, id } = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
    if (!createdAt || !id) return null;
    return { createdAt: new Date(createdAt), id };
  } catch {
    return null;
  }
}

export function encodeCursor(doc) {
  return Buffer.from(
    JSON.stringify({ createdAt: doc.createdAt, id: String(doc._id) }),
    'utf8'
  ).toString('base64url');
}

// Keyset filter for descending `{ createdAt: -1, _id: -1 }` pagination: pick
// rows strictly after the cursor in that sort order.
export function cursorFilter(cursor) {
  if (!cursor) return {};
  return {
    $or: [
      { createdAt: { $lt: cursor.createdAt } },
      { createdAt: cursor.createdAt, _id: { $lt: cursor.id } },
    ],
  };
}
