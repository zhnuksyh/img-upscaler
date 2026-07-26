import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
// Self-hosted Poppins — bundled rather than pulled from a CDN so the installed
// PWA renders correctly offline. Latin subset and only the four weights the UI
// uses; the full family would add ~380 KB of unused glyphs to the precache.
import '@fontsource/poppins/latin-400.css';
import '@fontsource/poppins/latin-500.css';
import '@fontsource/poppins/latin-600.css';
import '@fontsource/poppins/latin-700.css';
import './index.css';
import { registerSW } from 'virtual:pwa-register';

// Precache the shell for offline use. Updates are applied on the next load
// rather than immediately, so a new deploy can't swap assets out from under
// an in-flight batch.
registerSW({ immediate: false });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
