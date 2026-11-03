import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://127.0.0.1:3000',
      '/v1': 'http://127.0.0.1:3000',
      '/media': 'http://127.0.0.1:3000',
      '/sdk': 'http://127.0.0.1:3000',
      '/inbound': 'http://127.0.0.1:3000',
    },
  },
  preview: {
    port: 4173,
  },
  build: {
    chunkSizeWarningLimit: 1600,
  },
})
