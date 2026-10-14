import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
export default defineConfig({
  plugins: [react(), tailwindcss()], base: './',
  build: {rollupOptions: {output: {manualChunks(id) {
    // Cache SDK modules separately from the cellar UI and keep chunks compact.
    if (id.includes('node_modules/@firebase/firestore') || id.includes('node_modules/firebase/firestore/')) return 'firebase-firestore';
    if (id.includes('node_modules/@firebase/auth') || id.includes('node_modules/firebase/auth/')) return 'firebase-auth';
    if (id.includes('node_modules/@firebase/') || id.includes('node_modules/firebase/')) return 'firebase-core';
  }}}}
});
