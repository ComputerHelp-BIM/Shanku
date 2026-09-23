# Deploying Shanku

Shanku is a static site: `apps/web/dist` after a build. It is an npm-workspaces monorepo, so hosts must
install and build from the **repository root**, never from `apps/web` alone (the local packages
`@shanku/engine`, `@shanku/ui` and `@shanku/tokens` are not on npm).

## GitHub Pages (automatic)

`.github/workflows/pages.yml` builds on every push to `main` with `BASE=/Shanku/` and publishes to
`https://computerhelp-bim.github.io/Shanku/`.

## Vercel

`vercel.json` at the repository root tells Vercel how to build:

| Setting | Value |
|---|---|
| Install | `npm ci` |
| Build | tokens → ui → web |
| Output | `apps/web/dist` |
| Base path | `/` (the default; only GitHub Pages sets `BASE`) |

In the Vercel dashboard, one project is enough:

1. **Settings → General → Root Directory:** leave it **empty** (repository root). A root of `apps/web`
   is what made the "Production – shanku-web" project fail: `npm install` there cannot find the local
   `@shanku/*` packages.
2. **Framework Preset:** Other. Build and output settings come from `vercel.json`; leave the dashboard
   overrides off.
3. **Node.js version:** 22.x (matches `.nvmrc`).
4. Delete the second project (Production – shanku-web) so each push deploys once.

Before this file existed, the root project built successfully but failed at the end: Vercel looked for
`dist` or `public` at the root and found neither.
