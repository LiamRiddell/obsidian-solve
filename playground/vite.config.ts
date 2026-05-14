import { defineConfig } from 'vite'
import path from 'path'

export default defineConfig({
  root: __dirname,
  base: '/',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '../src'),
      'convert-units': path.resolve(__dirname, './mock/convert-units.ts')
    }
  },
  define: {
    global: 'globalThis'
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
  },
  server: {
    port: 5173,
    open: true,
    fs: {
      allow: ['..']
    }
  }
})
