import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@shared': fileURLToPath(new URL('./shared', import.meta.url)) },
  },
  server: {
    port: 5173,
    // Keep the browser's Host header: the API refuses writes whose Origin and Host differ.
    proxy: { '/api': { target: 'http://127.0.0.1:5178', changeOrigin: false } },
  },
  build: { outDir: 'dist', emptyOutDir: true },
})
