// Only reload from a safe screen. Native background updates remain available.
export function createOtaController(updater, canApply, publish) {
  let pending = null, timer = null, applying = false, stopped = false;
  const attempted = new Set();
  function schedule() {
    if (stopped || timer || !pending || applying) return;
    timer = setTimeout(async () => {
      timer = null;
      if (stopped || !pending) return;
      if (!canApply()) { schedule(); return; }
      const bundle = pending;
      pending = null;
      applying = true;
      attempted.add(bundle.id);
      try {
        // Native set()/notifyAppReady() can leave the installed bundle in
        // getNextBundle(). Check again at the reload boundary, across boots.
        const current = (await updater.current()).bundle;
        if (current?.id === bundle.id || current?.version === bundle.version) {
          applying = false;
          publish('Your app is up to date.');
          return;
        }
        if (!canApply()) { applying = false; attempted.delete(bundle.id); pending = bundle; schedule(); return; }
        publish('Installing update… The app will reopen automatically.');
        await updater.set({ id: bundle.id });
      }
      catch {
        applying = false;
        publish('Update could not be applied. Your current app is still available.');
      }
    }, 2000);
  }
  return {
    available(bundle, { retry = false } = {}) {
      if (retry && !applying && bundle?.id) attempted.delete(bundle.id);
      if (stopped || !bundle?.id || attempted.has(bundle.id)
          || !['pending', 'success'].includes(bundle.status)) return;
      pending = bundle;
      publish('Update downloaded. It will install automatically on this screen when your work is saved.');
      schedule();
    },
    stop() { stopped = true; clearTimeout(timer); timer = null; }
  };
}
