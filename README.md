# Ben's Tally

A self-hosted, phone-first personal finance tracker that replaces a spreadsheet: month-end
net-worth snapshots, budget and spending, investments and a FIRE plan.

Nothing personal lives in this repository. Every account, amount, rule, target and assumption
is data entered in the app and stored in the SQLite database in the container's `/data` folder.

## Stack

- SvelteKit (Node adapter) and TypeScript
- SQLite via better-sqlite3, migrations with Drizzle (`drizzle/`)
- Money as integer cents; all dates in Australia/Hobart
- Sign-in with any OIDC provider (built for Pocket-ID)

## Running

The image is `ghcr.io/dubberness/bens-tally`. On Unraid, use `unraid-template.xml`.

| Variable                                | Purpose                                                                   |
| --------------------------------------- | ------------------------------------------------------------------------- |
| `ORIGIN`                                | Public address, e.g. `https://tally.benpost.com`                          |
| `OIDC_ISSUER`                           | OIDC provider, e.g. `https://pocketid.benpost.com`                        |
| `OIDC_CLIENT_ID` / `OIDC_CLIENT_SECRET` | The OIDC client. Callback URL: `<ORIGIN>/auth/callback`                   |
| `OIDC_ALLOWED_SUBJECTS`                 | Optional allow-list. Empty: the first person to sign in becomes the owner |
| `DATA_DIR`                              | Defaults to `/data` in the image                                          |

Unauthenticated routes: `/api/health`, `/signin` and `/auth/*`.

Backups run nightly at 2:30 am (SQLite online backup), keeping 14 daily and 12 monthly copies
in `/data/backups`.

## Development

```sh
npm install
cp .env.example .env    # set DEV_SKIP_LOGIN=1 to work without Pocket-ID
npm run dev
npm run check && npm test
```

After changing `src/lib/server/db/schema.ts`, run `npm run db:generate` and commit the new
migration.

The image is built by the GitHub Actions workflow; run it by hand:
`gh workflow run docker-build.yml --ref main`.
