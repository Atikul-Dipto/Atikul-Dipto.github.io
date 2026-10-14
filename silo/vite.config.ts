import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Served as a sub-page of the portfolio: atikul-dipto.github.io/silo/
export default defineConfig({
  base: '/silo/',
  plugins: [react()],
  build: {
    rolldownOptions: {
      output: {
        advancedChunks: {
          // Physics is deliberately NOT listed here. A manual group overrides
          // rolldown's own splitting around dynamic imports, and both attempts
          // at one left the entry chunk with a static import of the physics
          // bundle -- so every visitor downloaded 850 kB of WebAssembly to look
          // at a scene they were never going to walk around. Left alone, the
          // lazy import in SiloScene defines the boundary by itself.
          //
          // Order still matters for the rest: a module joins the first group
          // whose test it matches.
          groups: [
            {
              name: 'three',
              test: /node_modules[\/](three|@react-three[\/](fiber|drei|postprocessing))[\/]/,
            },
            {
              name: 'vendor',
              test: /node_modules[\/](react|react-dom|gsap|zustand|scheduler)[\/]/,
            },
          ],
        },
      },
    },
  },
})
