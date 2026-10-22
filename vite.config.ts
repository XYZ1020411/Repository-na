import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
// Cloudflare Workers/Pages uses the domain root. GitHub Pages needs the repository subpath.
export default defineConfig({
  base: process.env.VITE_BASE_PATH || '/',
  plugins: [react()],
  server: { proxy: { '/api': 'http://localhost:8787' } },
});
