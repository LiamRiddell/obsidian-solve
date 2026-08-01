import path from "path"
import { fileURLToPath } from "url"
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const dirname = path.dirname(fileURLToPath(import.meta.url))

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: [
      // Specific aliases MUST come before catch-all prefixes so they match first
      { find: "@solve-js-examples", replacement: path.resolve(dirname, "../packages/core/examples") },
      { find: "@solve-js", replacement: path.resolve(dirname, "../packages/core/src") },
      { find: "@bridge", replacement: path.resolve(dirname, "../packages/playground-bridge/src") },
      { find: "@", replacement: path.resolve(dirname, "./src") },
    ],
  },
  define: {
    global: "globalThis",
  },
  worker: {
    format: "es",
  },
  optimizeDeps: {
    exclude: ["style-mod", "@marijn/find-cluster-break"],
  },
  server: {
    port: 5174,
    open: true,
  },
})
