import React, { useEffect, useState } from 'react';
import { offlineShellState, subscribeOfflineShell } from '../utils/offlineShell';

export default function OfflineStatus() {
  const [state, setState] = useState(offlineShellState);
  useEffect(() => subscribeOfflineShell(setState), []);
  const label = {
    ready: 'App available offline', preparing: 'Preparing app for offline use…',
    update: 'Update ready — close all app tabs and reopen to apply',
    unavailable: 'Offline restart not ready — keep this tab open without signal'
  }[state];
  return <p role="status" className="text-[11px] text-slate-500 mt-2">{label}</p>;
}
