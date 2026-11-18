// Deploys Vice Cope (public/gta6-watch-party/) to its own Cloudflare Pages
// project, https://vice-cope.pages.dev:
//
//   node scripts/deploy-vice-cope.mjs
//
// The files are copied to a temporary folder and deployed from there, so
// wrangler doesn't pick up this repo's wrangler.toml (the portfolio project,
// with its functions and database). The lobby API stays on the portfolio
// project (functions/api/watchparty.ts).
import { execSync } from 'node:child_process'
import { cpSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const work = mkdtempSync(join(tmpdir(), 'vice-cope-'))
try {
  cpSync(join(root, 'public', 'gta6-watch-party'), join(work, 'site'), { recursive: true })
  const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx'
  execSync(`${npx} wrangler pages deploy site --project-name vice-cope --branch main --commit-dirty=true`, { cwd: work, stdio: 'inherit', shell: true })
} finally {
  rmSync(work, { recursive: true, force: true })
}
