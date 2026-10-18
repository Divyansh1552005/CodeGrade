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

// ---- Strict parsing, for routes that must answer 400 to a bad cursor instead of quietly
// ---- starting again from the first page (see decodeCursor above for the lenient version).
const OBJECT_ID = /^[0-9a-f]{24}$/i;

function badCursor() {
  const err = new Error('Invalid cursor');
  err.status = 400;
  return err;
}

/** null when no cursor was sent; throws a 400 error for anything that is not a cursor we issued. */
export function parseCursor(raw) {
  if (raw === undefined || raw === null || raw === '') return null;
  let parsed;
  try {
    parsed = JSON.parse(Buffer.from(String(raw), 'base64url').toString('utf8'));
  } catch {
    throw badCursor();
  }
  const { createdAt, id } = parsed && typeof parsed === 'object' ? parsed : {};
  const date = new Date(createdAt);
  if (typeof createdAt !== 'string' || Number.isNaN(date.getTime()) || typeof id !== 'string' || !OBJECT_ID.test(id)) {
    throw badCursor();
  }
  return { createdAt: date, id };
}
