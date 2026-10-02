// Compare user content, excluding local bookkeeping changed during a save/upload.
export function contentKey(record) {
  if (!record) return JSON.stringify(record);
  const content = { ...record };
  for (const key of ['revision', 'cloudRevision', 'pendingSync', 'writerId', 'updatedAt']) delete content[key];
  content.items = (record.items || []).map((item) => ({ ...item, photos: (item.photos || []).map((photo) => {
    const value = { ...photo };
    delete value.syncStatus;
    delete value.storagePath;
    return value;
  }) }));
  return JSON.stringify(content);
}

export function settleUpload(current, uploaded, result) {
  if (!current || current.id !== uploaded.id || !result?.pushed) return current;
  const unchanged = contentKey(current) === contentKey(uploaded);
  const synced = new Set(result.syncedPhotoIds || []);
  const failed = new Set(result.failedPhotoIds || []);
  return {
    ...current,
    cloudRevision: result.cloudRevision,
    pendingSync: !unchanged || failed.size > 0,
    deletedItemIds: (current.deletedItemIds || []).filter((id) => !(uploaded.deletedItemIds || []).includes(id)),
    deletedPhotoIds: (current.deletedPhotoIds || []).filter((id) => !(uploaded.deletedPhotoIds || []).includes(id)),
    facility: result.facilityNumber ? {
      ...current.facility,
      facilityNumber: result.facilityNumber,
      facilityCode: `FAC-${String(result.facilityNumber).padStart(3, '0')}`
    } : current.facility,
    items: (current.items || []).map((item) => ({ ...item, photos: (item.photos || []).map((photo) => ({
      ...photo,
      ...(synced.has(photo.id) ? { syncStatus: 'synced', storagePath: result.photoPaths?.[photo.id] || photo.storagePath }
        : failed.has(photo.id) ? { syncStatus: 'failed' } : {})
    })) }))
  };
}
