/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  // PGlite loads its own .wasm/.data files; pre-bundling would break their URLs.
  optimizeDeps: { exclude: ['@electric-sql/pglite'] },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
})
