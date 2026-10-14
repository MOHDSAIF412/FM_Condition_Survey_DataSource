import { installDiagnostics } from './utils/diagnostics';
import React from 'react';
import ReactDOM from 'react-dom/client';
import AuthGate from './components/AuthGate';
import './index.css';

import ErrorBoundary from './components/ErrorBoundary';
import { initOtaUpdates } from './utils/otaUpdates';
import { registerOfflineShell } from './utils/offlineShell';

function BootReady() {
  React.useEffect(() => { initOtaUpdates(); registerOfflineShell(); }, []);
  return null;
}

installDiagnostics();
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <AuthGate />
      <BootReady />
    </ErrorBoundary>
  </React.StrictMode>
);
