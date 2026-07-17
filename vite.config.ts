import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/socket.io': {
        target: 'http://localhost:3210',
        ws: true,
      },
    },
  },
  build: {
    outDir: 'dist/client',
  },
  test: {
    include: ['server/**/*.test.ts'],
    environment: 'node',
  },
})
