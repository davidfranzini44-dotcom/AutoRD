import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    // Use the harness-assigned port when present; fall back to 5174 locally.
    port: Number(process.env.PORT) || 5174,
    host: true,
  },
})
