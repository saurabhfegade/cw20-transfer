import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 3000,
    watch: {
      usePolling: true,
    },
    hmr: {
      overlay: true
    }
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
  }
}); 