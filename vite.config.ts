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
    rollupOptions: {
      output: {
        // xterm is shared by the lazy Terminals and Workspace chunks, so
        // without this it gets hoisted into the entry bundle and every user
        // pays for a terminal they may never open.
        manualChunks: (id: string) =>
          id.includes('node_modules/@xterm/') ? 'xterm' : undefined,
      },
    },
  },
  server: {
    port: 5173,
  },
})
