// Builds the whole site into dist/ -- the portfolio at the root and each
// sub-app in its own folder -- the same way .github/workflows/deploy.yml does
// for GitHub Pages, so the same folder can be uploaded to Cloudflare Pages:
//
//   node scripts/build-site.mjs
//   npx wrangler pages deploy dist --project-name atikul-islam-portfolio --branch main
//
// Pass --install to run `npm ci` in each project first, as CI does.
import { execSync } from 'node:child_process'
import { cpSync, mkdirSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const install = process.argv.includes('--install')
const dist = join(root, 'dist')

const run = (cmd, cwd) => {
  console.log(`\n> ${cmd}  (${cwd === root ? '.' : cwd.slice(root.length + 1)})`)
  execSync(cmd, { cwd, stdio: 'inherit' })
}

const build = (dir) => {
  const cwd = join(root, dir)
  if (install) run('npm ci', cwd)
  run('npm run build', cwd)
  return join(cwd, 'dist')
}

// Portfolio (site root). Its public/ carries _headers, the caching rules.
build('.')

// Sub-apps, each built with its own `base` matching the folder below.
const subApps = [
  ['ecommerce-price-tracker', 'price-pulse'],
  ['job-market-dashboard', 'work-signal'],
  ['silo', 'silo'],
]
for (const [dir, path] of subApps) {
  const out = build(dir)
  const target = join(dist, path)
  rmSync(target, { recursive: true, force: true })
  mkdirSync(target, { recursive: true })
  cpSync(out, target, { recursive: true })
}

// Employer logos are shared with the main site; the silo loads them relative
// to its own base.
cpSync(join(root, 'public', 'logos'), join(dist, 'silo', 'logos'), { recursive: true })

console.log('\nSite built in dist/')
