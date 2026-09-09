import React from 'react';
import ReactDOM from 'react-dom/client';
import AuthGate from './components/AuthGate';
import './index.css';

import ErrorBoundary from './components/ErrorBoundary';
import { initOtaUpdates } from './utils/otaUpdates';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <AuthGate />
    </ErrorBoundary>
  </React.StrictMode>
);

// Must run after the app has actually rendered. The updater treats a bundle
// that never reports ready as broken and rolls back to the previous one, which
// is the safety net that stops a bad update from bricking the app.
initOtaUpdates();
