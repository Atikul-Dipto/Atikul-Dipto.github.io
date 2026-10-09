import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Served as a sub-page of the portfolio: atikul-dipto.github.io/silo/
export default defineConfig({
  base: '/silo/',
  plugins: [react()],
  build: {
    // three + R3F + drei is the bulk; splitting it lets the UI shell and the
    // loading screen paint before the engine is parsed.
    rolldownOptions: {
      output: {
        advancedChunks: {
          groups: [
            { name: 'three', test: /node_modules[\/](three|@react-three)[\/]/ },
            { name: 'vendor', test: /node_modules[\/](react|react-dom|gsap|zustand|scheduler)[\/]/ },
          ],
        },
      },
    },
  },
})
