import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

import ErrorBoundary from './components/ErrorBoundary';
import { initOtaUpdates } from './utils/otaUpdates';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);

// Must run after the app has actually rendered. The updater treats a bundle
// that never reports ready as broken and rolls back to the previous one, which
// is the safety net that stops a bad update from bricking the app.
initOtaUpdates();
