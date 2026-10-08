let accountId = null;
let legacyOwner = null;

// Keep the original database with the account last signed in before this update.
// Other accounts get separate databases; no drafts or photos are deleted.
export function selectDeviceAccount(userId) {
  if (!userId) return;
  accountId = userId;
  legacyOwner = null;
  const existingOwner = localStorage.getItem('fm_storage_legacy_owner');
  legacyOwner = existingOwner || localStorage.getItem('fm_last_account') || userId;
  if (!existingOwner) localStorage.setItem('fm_storage_legacy_owner', legacyOwner);
}

export function deviceStorageScope() {
  const suffix = accountId && accountId !== legacyOwner ? `_${encodeURIComponent(accountId)}` : '';
  return { accountId, database: `FM_Condition_Survey_DB${suffix}`,
    activeKey: `fm_active_survey_id${suffix}`, fallbackKey: `fm_current_survey${suffix}`,
    savedKey: `fm_last_saved${suffix}` };
}
