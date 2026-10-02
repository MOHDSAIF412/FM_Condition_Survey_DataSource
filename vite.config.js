import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { offlinePlugin } from './scripts/offlinePlugin';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), offlinePlugin()],
  server: {
    host: true, // enables access over local network on mobile devices
    port: Number(process.env.PORT) || 3000
  }
});
