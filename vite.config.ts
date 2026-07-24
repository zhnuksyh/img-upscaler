import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// GitHub Pages base path.
// - For a project page (https://<user>.github.io/<repo>/) set VITE_BASE to "/<repo>/".
// - The deploy workflow derives this automatically from the repository name.
// - Falls back to "./" for relative asset loading (works for user/org pages too).
const base = process.env.VITE_BASE ?? './';

export default defineConfig({
  base,
  plugins: [react()],
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
});
