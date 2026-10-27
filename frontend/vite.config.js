import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  // docker-compose passes REACT_APP_* names, so expose those alongside VITE_*.
  envPrefix: ['VITE_', 'REACT_APP_'],
  server: {
    host: '0.0.0.0',
    port: 3000,
    strictPort: true,
  },
  preview: {
    host: '0.0.0.0',
    port: 3000,
  },
});
