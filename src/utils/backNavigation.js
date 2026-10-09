export function backTarget({ view, qhse = false, hasProject = false, activeTab = 'facility' }) {
  if (view === 'modules') return null;
  if (view === 'projects') return { view: 'modules', label: 'Choose module' };
  if (view === 'qhse' || view === 'facilities') return { view: 'projects', label: 'Projects' };
  if (view === 'survey') {
    if (!qhse && activeTab !== 'facility') return { view: 'survey', tab: 'facility', label: 'Facility details' };
    return { view: hasProject ? (qhse ? 'qhse' : 'facilities') : 'projects', label: qhse && hasProject ? 'Project inspections' : hasProject ? 'Project facilities' : 'Projects' };
  }
  if (view === 'reports' && hasProject && qhse) return { view: 'qhse', label: 'Project inspections' };
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
