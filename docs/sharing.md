# Shared models (opt-in)

A view link holds the view, never the model. **Share with the model** (View link dialog) uploads the open
model so the link opens without the file at hand — for team members who do not have it.

## Privacy

- **Encrypted on the sharer's device** (gzip, then AES-GCM 256 with a random key and IV). The key is only in
  the link's `#` fragment, which browsers never send to a server: the stored copy is unreadable without the
  link. Anyone *with* the link can open the model — share it like the file itself.
- **Kept as chosen:** 1 hour, 1 day, 3 days, or until deleted. An expired share is refused at once and
  removed by the daily cleanup (03:00 UTC, `vercel.json` crons).
- **Deleting:** the sharer's browser keeps a delete secret (My shared models); the server stores only its
  SHA-256. Deleting from another browser is not possible.
- **No sign-in** (internal team use for now). Optional `SHARE_TEAM_CODE`: when set, uploads need it.

## Set up on Vercel (once)

1. Vercel → the Shanku project → **Storage** → **Create** → **Blob** → connect it to the project (all
   environments). This adds `BLOB_READ_WRITE_TOKEN`.
2. Optional, Settings → Environment Variables: `SHARE_TEAM_CODE` (a code your team types once in Shanku),
   `CRON_SECRET` (any long random text; protects the daily cleanup).
3. Redeploy. The View link dialog then offers **Upload and copy link**; until then it says sharing is not
   set up.

Locally, `npm run dev` / `npm run preview` serve `/api/share` with the same rules, storing files in
`apps/web/node_modules/.shanku-shares`.

## Plans

Vercel's Hobby plan is for personal, non-commercial use; a company's internal tool is commercial use, which
Vercel's terms put on Pro (this applies to hosting the site, not only to storage). Storage sits behind a small
interface (`api/_share-core.ts` `ShareStore`), so another store (for example Cloudflare R2) can be added
without touching the rest.

## Code

`api/_share-core.ts` (rules), `api/_share-vercel.ts` and `api/_share-local.ts` (stores), `api/share.ts`
(the route), `apps/web/src/lib/sharedModel.ts` (encryption, upload, open), tests in
`apps/web/test/sharing.test.ts`.
