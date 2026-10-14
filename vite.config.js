import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { securityPolicyPlugin } from './scripts/securityHeaders';
import { offlinePlugin } from './scripts/offlinePlugin';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), securityPolicyPlugin(), offlinePlugin()],
  server: {
    host: '127.0.0.1', // enables access over local network on mobile devices
    port: Number(process.env.PORT) || 3000
  }
});
