// Use the existing project notes storage, preserving the original notes for restore.
// No permissions, memberships, survey IDs or photo storage paths are changed.
export function readProjectTrash(notes) {
  try {
    const value = JSON.parse(notes || '');
    if (value?._fmProjectTrash === 1 && typeof value.deletedAt === 'string' && typeof value.notes === 'string') return value;
  } catch { /* Ordinary project notes. */ }
  return null;
}
export function projectTrashNotes(notes, deleted, now = new Date().toISOString()) {
  const existing = readProjectTrash(notes);
  const original = existing?.notes ?? notes ?? '';
  return deleted ? JSON.stringify({ _fmProjectTrash: 1, deletedAt: existing?.deletedAt || now, notes: original }) : original;
}
