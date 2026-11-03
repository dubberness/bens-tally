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

| Variable                                | Purpose                                                                    |
| --------------------------------------- | -------------------------------------------------------------------------- |
| `ORIGIN`                                | Public address, e.g. `https://tally.benpost.com`                           |
| `OIDC_ISSUER`                           | OIDC provider, e.g. `https://pocketid.benpost.com`                         |
| `OIDC_CLIENT_ID` / `OIDC_CLIENT_SECRET` | The OIDC client. Callback URL: `<ORIGIN>/auth/callback`                    |
| `OIDC_ALLOWED_SUBJECTS`                 | Optional allow-list. Empty: the first person to sign in becomes the owner  |
| `UP_TOKEN`                              | Optional Up personal access token; the app only reads with it              |
| `WORKER_URL` / `WORKER_TOKEN`           | Optional mail Worker for Betashares emails (see `worker/README.md`)        |
| `API_READ_TOKEN` / `API_WRITE_TOKEN`    | Optional tokens for scripted access from the home network (32+ characters) |
| `DATA_DIR`                              | Defaults to `/data` in the image                                           |

Your history loads from an .xlsx export of the old spreadsheet at Manage › Sheet import.

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

## Browser tests

`npm run test:e2e` builds the app, fills a throwaway data folder with a made-up household
(`e2e/seed.spec.ts`: invented accounts, a fictional fund, round numbers), starts the server on
port 5187 with its background jobs off, and drives Chromium through every main screen and the key
sub-screens at phone and desktop size, dark and light. A test fails on a server error, a console
error, a failed request, a page that scrolls sideways, or colours that don't match the scheme.
It also checks the home-screen install tags, the downloads and the Theme setting.

The browser signs in with throwaway tokens that only exist for that run (`API_READ_TOKEN` and
`API_WRITE_TOKEN`, set by `e2e/serve.mjs`), so it never touches your real data or login. Playwright
needs a Chromium: `npx playwright install chromium` once, or point `PLAYWRIGHT_CHROMIUM_PATH` at
one you already have. It isn't part of the Docker build or the CI image.

To look at the seeded household yourself: `DATA_DIR=/tmp/tally-demo npm run e2e:seed`, then
`DATA_DIR=/tmp/tally-demo DEV_SKIP_LOGIN=1 npm run dev`.
