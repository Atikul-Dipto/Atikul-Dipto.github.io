# Atikul Islam — Portfolio

Personal portfolio site, built with React + Vite. Live at [atikul-dipto.github.io](https://atikul-dipto.github.io).

## Development

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

Deploys automatically to GitHub Pages via GitHub Actions on every push to `main`.

The site is also published on Cloudflare Pages, at
https://atikul-islam-portfolio.pages.dev, uploaded from a local build rather
than from GitHub:

```bash
node scripts/build-site.mjs        # whole site into dist/, as the workflow does
npx wrangler pages deploy dist --project-name atikul-islam-portfolio --branch main
```

`public/_headers` sets the caching there: hashed scripts and styles for a year,
media for a week, pages always revalidated. GitHub Pages ignores it and caches
everything for ten minutes.

`functions/api/citizens.ts` is the one server-side piece: the silo's citizens
register, a Pages Function deployed with the site, storing names in a free D1
database (`silo-citizens`; schema in `migrations/`, binding in `wrangler.toml`).
Its private take-down token is a Pages secret, `ADMIN_TOKEN`, kept by the owner
outside the repository.
