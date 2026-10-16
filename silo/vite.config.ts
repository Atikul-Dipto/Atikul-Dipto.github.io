import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

/**
 * The scene is a lazy import, so the browser only learns it needs it -- and
 * the 1.2 MB of three.js under it -- once the entry script has downloaded and
 * run: a whole round trip of the loading screen spent waiting. This adds
 * modulepreload links for that chunk and everything it imports, so they
 * download alongside the entry.
 *
 * It also writes prefetch.json, the files a first visit needs, which the
 * portfolio fetches to warm the cache before a visitor clicks through.
 * Physics (the walk mode) is listed last: it is only needed on Enter.
 */
function preloadScene(): Plugin {
  const lazy = [/src[\\/]three[\\/]SiloScene\.tsx$/]
  const later = [/src[\\/]three[\\/]physics[\\/]WalkMode\.tsx$/]
  return {
    name: 'silo-preload-scene',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        const bundle = ctx.bundle
        if (!bundle) return html
        const base = '/silo/'
        const chunks = Object.values(bundle).filter((c) => c.type === 'chunk')
        const closure = (tests: RegExp[]) => {
          const out = new Set<string>()
          const visit = (file: string) => {
            if (out.has(file)) return
            const c = bundle[file]
            if (!c || c.type !== 'chunk') return
            out.add(file)
            c.imports.forEach(visit)
          }
          for (const c of chunks) if (c.facadeModuleId && tests.some((t) => t.test(c.facadeModuleId!))) visit(c.fileName)
          return out
        }
        const scene = closure(lazy)
        const entry = chunks.filter((c) => c.isEntry).flatMap((c) => [c.fileName, ...c.imports])
        const css = Object.values(bundle)
          .filter((a) => a.fileName.endsWith('.css'))
          .map((a) => a.fileName)
        const walk = [...closure(later)].filter((f) => !scene.has(f) && !entry.includes(f))
        const first = [...new Set([...entry, ...css, ...scene])]
        this.emitFile({
          type: 'asset',
          fileName: 'prefetch.json',
          source: JSON.stringify({ first: [...first.map((f) => base + f), `${base}env/room.png`], later: walk.map((f) => base + f) }),
        })
        const tags = [...scene]
          .filter((f) => !html.includes(f))
          .map((f) => `    <link rel="modulepreload" crossorigin href="${base}${f}">`)
          .join('\n')
        return tags ? html.replace(/\n\s*<\/head>/, `\n${tags}\n  </head>`) : html
      },
    },
  }
}

// Served as a sub-page of the portfolio: atikul-dipto.github.io/silo/
export default defineConfig({
  base: '/silo/',
  plugins: [react(), preloadScene()],
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
