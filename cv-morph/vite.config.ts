import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

const root = dirname(fileURLToPath(import.meta.url))
const BASE = '/cv-morph/'
const mod = (path: string) => join(root, 'node_modules', path)
const version = (name: string): string => JSON.parse(readFileSync(mod(`${name}/package.json`), 'utf8')).version

// A new Tesseract is a new folder, so a browser that kept the old engine
// (the service worker keeps these for good) never pairs it with a new worker.
const OCR_DIR = `ocr-${version('tesseract.js')}-${version('tesseract.js-core')}`

/**
 * Reading a picture of a CV is done by Tesseract, compiled to WebAssembly. Its
 * worker, engine and English model are served from this site rather than a
 * CDN, so a CV never passes through anyone else's server and the app still
 * reads pictures offline once they have been fetched. They are copied out of
 * node_modules at build time instead of being committed (15 MB).
 */
function ocrAssets(): Plugin {
  const files: Record<string, string> = {
    'worker.min.js': mod('tesseract.js/dist/worker.min.js'),
    'eng.traineddata.gz': mod('@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz'),
  }
  // The worker picks one of these by what the device's WebAssembly supports.
  for (const kind of ['relaxedsimd-lstm', 'simd-lstm', 'lstm']) {
    files[`tesseract-core-${kind}.wasm.js`] = mod(`tesseract.js-core/tesseract-core-${kind}.wasm.js`)
  }
  const types: Record<string, string> = { js: 'text/javascript', gz: 'application/gzip' }
  return {
    name: 'cv-morph-ocr-assets',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = (req.url ?? '').split('?')[0]
        const at = path.indexOf(`/${OCR_DIR}/`)
        const file = at >= 0 ? files[path.slice(at + OCR_DIR.length + 2)] : undefined
        if (!file) return next()
        res.setHeader('Content-Type', types[file.split('.').pop() ?? ''] ?? 'application/octet-stream')
        res.end(readFileSync(file))
      })
    },
    generateBundle() {
      for (const [name, file] of Object.entries(files)) {
        this.emitFile({ type: 'asset', fileName: `${OCR_DIR}/${name}`, source: readFileSync(file) })
      }
    },
  }
}

/**
 * Writes sw.js (from tools/service-worker.js) with the list of files the app
 * is made of, so an installed copy opens and works without a connection. The
 * OCR engine and the CV typefaces are left out: they are large, most visits
 * need few of them, and the worker keeps each one the first time it is used.
 */
function serviceWorker(): Plugin {
  return {
    name: 'cv-morph-service-worker',
    apply: 'build',
    enforce: 'post',
    generateBundle(_, bundle) {
      const shell = Object.keys(bundle)
        .filter((file) => /\.(js|mjs|css)$/.test(file) && !file.startsWith(OCR_DIR))
        .sort()
      const build = createHash('sha256').update(shell.join('\n')).digest('hex').slice(0, 10)
      const source = readFileSync(join(root, 'tools/service-worker.js'), 'utf8')
        .replace("'__BUILD__'", JSON.stringify(build))
        .replace("'__SHELL__'", JSON.stringify(shell))
        .replace("'__KEEP__'", JSON.stringify([`${OCR_DIR}/`, 'assets/']))
      this.emitFile({ type: 'asset', fileName: 'sw.js', source })
    },
  }
}

// Served as a sub-page of the portfolio: atikul-dipto.github.io/cv-morph/
export default defineConfig({
  base: BASE,
  plugins: [react(), ocrAssets(), serviceWorker()],
  define: {
    __OCR_DIR__: JSON.stringify(OCR_DIR),
  },
  build: {
    // pdf.js and its worker are written for current browsers (top-level await).
    target: 'es2022',
    chunkSizeWarningLimit: 1400,
  },
})
