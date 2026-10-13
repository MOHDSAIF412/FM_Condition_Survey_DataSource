// `hub` names the module's own project screen ('qhse' or 'meter'); Condition
// Survey uses the facilities screen and tabs instead. `qhse: true` is the
// older spelling of hub 'qhse'.
const HUB_LABELS = { qhse: 'Project inspections', meter: 'Project meter mappings' };
export function backTarget({ view, qhse = false, hub = qhse ? 'qhse' : null, hasProject = false, activeTab = 'facility' }) {
  if (view === 'modules') return null;
  if (view === 'projects') return { view: 'modules', label: 'Choose module' };
  if (view in HUB_LABELS || view === 'facilities') return { view: 'projects', label: 'Projects' };
  if (view === 'survey') {
    if (!hub && activeTab !== 'facility') return { view: 'survey', tab: 'facility', label: 'Facility details' };
    return { view: hasProject ? (hub || 'facilities') : 'projects', label: hub && hasProject ? HUB_LABELS[hub] : hasProject ? 'Project facilities' : 'Projects' };
  }
  if (view === 'reports' && hasProject && hub) return { view: hub, label: HUB_LABELS[hub] };
  if (['photos', 'reports'].includes(view) && hasProject) return { view: 'facilities', label: 'Project facilities' };
  return { view: 'modules', label: 'Choose module' };
}

// StrictMode can unmount before the native listener promise resolves.
export function installAndroidBackHandler(app, onBack) {
  let removed = false;
  const registration = app.addListener('backButton', onBack);
  return async () => {
    if (removed) return;
    removed = true;
    const handle = await registration;
    await handle.remove();
  };
}
