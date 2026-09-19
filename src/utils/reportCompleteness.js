import { getSettings } from '../config/appSettings';

/**
 * What a report is about to leave out or get wrong, checked before it is built.
 *
 * Cost is deliberately not checked: no snag in the live data carries an
 * estimate, so a warning would appear on every report and teach everyone to
 * click straight past it.
 */
export function reportCompleteness(input) {
  const surveys = (Array.isArray(input) ? input : [input]).filter(Boolean);
  const counts = {
    facilities: surveys.length,
    snags: 0,
    urgentNoPhoto: 0,
    otherNoPhoto: 0,
    missingPhotoFiles: 0,
    noDescription: 0,
    emptyFacilities: 0,
    drafts: 0
  };

  for (const s of surveys) {
    if (s.status !== 'submitted') counts.drafts++;
    const items = s.items || [];
    if (!items.length) counts.emptyFacilities++;

    for (const item of items) {
      counts.snags++;
      const photos = item.photos || [];
      if (!photos.length) {
        if (Number(item.priority) === 1) counts.urgentNoPhoto++;
        else counts.otherNoPhoto++;
      } else {
        // A photo whose bytes could not be fetched is dropped from the file.
        counts.missingPhotoFiles += photos.filter((p) => !p.dataUrl).length;
      }
      if (!String(item.defectDescription || '').trim()) counts.noDescription++;
    }
  }

  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  const issues = [];
  if (counts.urgentNoPhoto) issues.push(`${plural(counts.urgentNoPhoto, 'urgent (P1) snag has', 'urgent (P1) snags have')} no photo`);
  if (counts.otherNoPhoto) issues.push(`${plural(counts.otherNoPhoto, 'other snag has', 'other snags have')} no photo`);
  if (counts.missingPhotoFiles) issues.push(`${plural(counts.missingPhotoFiles, 'photo', 'photos')} could not be loaded and will be missing`);
  if (counts.noDescription) issues.push(`${plural(counts.noDescription, 'snag has', 'snags have')} no defect description`);
  if (counts.emptyFacilities) issues.push(`${plural(counts.emptyFacilities, 'facility has', 'facilities have')} no snags`);
  if (counts.drafts) issues.push(`${plural(counts.drafts, 'facility is', 'facilities are')} still a draft, not submitted`);

  return { counts, issues, ok: issues.length === 0 };
}

/**
 * Asks before building a report that has gaps. Returns true to go ahead.
 * `ask` is injectable so the wording can be tested.
 */
export function confirmReportReady(input, ask = (msg) => window.confirm(msg)) {
  // Settings can turn the check off for organisations that do not want it.
  if (!getSettings().reportEvidenceCheck) return true;
  const { issues, ok } = reportCompleteness(input);
  if (ok) return true;
  return ask(
    'Before this report goes to the client:\n\n'
    + issues.map((i) => `• ${i}`).join('\n')
    + '\n\nGenerate it anyway?'
  );
}
