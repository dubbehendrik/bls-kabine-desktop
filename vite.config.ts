import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
// base './' keeps all asset URLs relative, so the build works inside the Electron app protocol.
export default defineConfig({ base: './', plugins: [react()], build: { outDir: 'dist', emptyOutDir: true } });
