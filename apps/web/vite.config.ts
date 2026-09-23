import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Fixed loopback development entry (TECHNOLOGY_ARCHITECTURE §5, decision D4).
// No automatic port fallback; /api is proxied to the Nest process on loopback.
export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: false,
      },
    },
  },
  preview: {
    host: '127.0.0.1',
    port: 4173,
    strictPort: true,
  },
});
