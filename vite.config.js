// vite.config.js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: '/standalone-meeting-assist/',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
  },
});