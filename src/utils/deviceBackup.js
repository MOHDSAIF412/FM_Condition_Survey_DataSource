import { deviceStorageScope } from './deviceAccount';
import { getSurveyOffline, saveSurveyOffline } from './storage';
export function validateDeviceBackup(backup, accountId) {
  if (backup?.schemaVersion !== 1 || backup.backupType !== 'device-records' || !Array.isArray(backup.records)) throw new Error('Choose an OCS device backup.');
  if (backup.accountId !== (accountId || null)) throw new Error('This backup belongs to a different account.');
  if (backup.records.length > 10000 || backup.records.some(r => !r?.id || !r.facility || !Array.isArray(r.items))) throw new Error('The backup contains invalid records.');
  if (new Set(backup.records.map(r => r.id)).size !== backup.records.length) throw new Error('The backup contains duplicate records.');
  return backup.records;
}
export async function restoreMissingDeviceRecords(backup, accountId) {
  const records = validateDeviceBackup(backup, accountId);
  let restored = 0, kept = 0;
  for (const record of records) {
    if (deviceStorageScope().accountId !== accountId) throw new Error('Account changed. Restore stopped; existing work is retained.');
    if (await getSurveyOffline(record.id)) { kept++; continue; }
    const result = await saveSurveyOffline(record, { pendingSync: !!record.pendingSync });
    if (result?.conflict) throw new Error('Another copy was saved while restoring. Existing work is retained.');
    restored++;
  }
  return { restored, kept };
}
