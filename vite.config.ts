import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'path'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  root: 'src/renderer',
  base: './',
  build: {
    outDir: resolve(__dirname, 'dist/renderer'),
    emptyOutDir: true,
  },
  server: {
    port: 5173,
  },
})
