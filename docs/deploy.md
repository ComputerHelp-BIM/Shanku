# Deploying cad2bim

cad2bim is a static site: `apps/web/dist` after a build. It is an npm-workspaces monorepo, so hosts must
install and build from the **repository root**, never from `apps/web` alone (the local packages
`@cad2bim/engine`, `@cad2bim/ui` and `@cad2bim/tokens` are not on npm).

## GitHub Pages (automatic)

`.github/workflows/pages.yml` builds on every push to `main` with `BASE=/Shanku/` and publishes to
`https://computerhelp-bim.github.io/Shanku/`. If the repository is renamed, change `BASE` in the same commit, or
the published page loads without its scripts.

## Vercel

Production is **https://cad2bim.vercel.app** (the Vercel project was renamed with the app).

`vercel.json` at the repository root tells Vercel how to build:

| Setting | Value |
|---|---|
| Install | `npm ci` |
| Build | tokens → ui → web |
| Output | `apps/web/dist` |
| Base path | `/` (the default; only GitHub Pages sets `BASE`) |

In the Vercel dashboard, one project is enough:

1. **Settings → General → Root Directory:** leave it **empty** (repository root). A root of `apps/web`
   is what made the old "Production – shanku-web" project fail: `npm install` there cannot find the local
   `@cad2bim/*` packages.
2. **Framework Preset:** Other. Build and output settings come from `vercel.json`; leave the dashboard
   overrides off.
3. **Node.js version:** 22.x (matches `.nvmrc`).
4. Keep a single project, so each push deploys once.

Before this file existed, the root project built successfully but failed at the end: Vercel looked for
`dist` or `public` at the root and found neither.

## Moving to cad2bim.in

1. Vercel → the project → **Settings → Domains** → add `cad2bim.in` (and `www.cad2bim.in`).
2. At GoDaddy, set the DNS records **exactly as Vercel shows them** for that domain, then wait for Vercel to
   verify it.
3. In `apps/web/index.html`, change the share tags' address (`og:url`, `og:image`) from cad2bim.vercel.app to
   cad2bim.in — link previews (WhatsApp, LinkedIn) need full addresses.
4. Revit: cad2bim Bridge for Revit 0.12.1 and later already accept `cad2bim.in` and its subdomains.
