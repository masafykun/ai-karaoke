import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => ({
  plugins: [react()],

  // Use relative asset paths for Tauri production builds (served from filesystem)
  base: mode === 'tauri' ? './' : '/',

  server: {
    host: '0.0.0.0',
    port: 43880,
    strictPort: true,
    proxy: {
      '/api': {
        // In Tauri dev mode: proxy to local Python backend
        // In Docker dev mode: proxy to Docker service
        target: process.env.TAURI_ENV_DEBUG
          ? 'http://localhost:18432'
          : 'http://backend:8000',
        changeOrigin: true,
        // Disable timeout for SSE (EventSource) long-lived connections
        timeout: 0,
        proxyTimeout: 0,
      },
    },
  },
}))
