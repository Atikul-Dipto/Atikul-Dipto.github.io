import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Served as a sub-page of the portfolio: atikul-dipto.github.io/silo/
// `fs.allow` lets the dev server read ../src/data.js — the silo's floors are
// built from the same profile data as the main site, so the two never drift.
export default defineConfig({
  base: '/silo/',
  plugins: [react()],
  server: { fs: { allow: ['..'] } },
})
