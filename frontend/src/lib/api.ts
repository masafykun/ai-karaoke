// In Docker dev:   VITE_API_BASE is unset → relative URLs → proxied by Vite to backend:8000
// In Tauri build:  VITE_API_BASE=http://localhost:18432 (set via .env.tauri) → direct to sidecar
export const API_BASE: string = import.meta.env.VITE_API_BASE ?? ''

export function apiUrl(path: string): string {
  return `${API_BASE}${path}`
}
