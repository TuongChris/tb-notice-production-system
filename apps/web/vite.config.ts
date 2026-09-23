import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Fixed loopback web entry (TECHNOLOGY_ARCHITECTURE §5, decision D4): 127.0.0.1:5173, no automatic
// port fallback; /api is proxied to the Nest process on loopback. The production-build preview
// (`vite preview`, used by `yarn smoke:local`) uses the same address and proxy as the dev server.
const apiProxy = {
  '/api': {
    target: 'http://127.0.0.1:3000',
    changeOrigin: false,
  },
};

export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: apiProxy,
  },
  preview: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: apiProxy,
  },
});
