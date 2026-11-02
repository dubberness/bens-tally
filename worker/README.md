# Mail Worker

A Cloudflare Email Worker that receives Betashares notification emails, keeps them in
D1 and hands them to the app. The app collects every 15 minutes, reads each email with
its own parser and confirms it; the Worker deletes collected and refused mail after
`KEEP_DAYS` (30).

How mail gets here: a Gmail filter forwards Betashares emails to an address on a domain
with Cloudflare Email Routing, and a routing rule sends that address to this Worker.

## What it accepts

Mail is kept only when all of these hold:

- it was sent to `IMPORT_ADDRESS`;
- the From address is one of `ALLOWED_SENDERS`;
- the topmost `Authentication-Results` from a server in `TRUSTED_AUTHSERV` shows DKIM or
  DMARC passing for `SENDER_DOMAIN` (results lower down are ignored: a sender could have
  written them);
- with `FORWARDED_BY` set, the envelope sender contains it.

Gmail's forwarding-confirmation email (from `forwarding-noreply@google.com`, DKIM for
google.com) is also kept, so its code shows in the app's Inbox while setting up the filter.

Anything else is refused and only its sender, subject, reason and authentication headers
are noted; the app shows these under Manage › Inbox and CSV › Refused mail.

## API

All calls need `Authorization: Bearer <APP_TOKEN>`.

| Call                     | Returns                                                  |
| ------------------------ | -------------------------------------------------------- |
| `GET /status`            | Counts waiting, collected and refused; recent refusals   |
| `GET /messages?limit=50` | Mail not yet collected, oldest first, with the raw email |
| `POST /ack {"ids": []}`  | Marks those as collected                                 |

## Setting it up

```sh
cd worker
npx wrangler d1 create tally-mail           # put the database_id in wrangler.toml
npx wrangler d1 execute tally-mail --remote --file schema.sql
npx wrangler secret put APP_TOKEN           # a long random string; also the app's WORKER_TOKEN
npx wrangler secret put IMPORT_ADDRESS      # the address the Gmail filter forwards to
npx wrangler secret put FORWARDED_BY        # optional: the Gmail account's address
npx wrangler deploy
```

Then, in Cloudflare: enable Email Routing on the domain and add a custom address rule
for `IMPORT_ADDRESS` with the action "Send to a Worker" → `tally-mail`. In Gmail, add the
address under Settings › Forwarding (the confirmation code appears in the app's Inbox),
then a filter for the two Betashares senders that forwards to it.

Give the container `WORKER_URL` (the Worker's workers.dev address) and `WORKER_TOKEN`.

Before relying on it, send one real email through and check Manage › Inbox and CSV. If it
was refused for its authentication results, the refusal shows the headers that arrived;
set `TRUSTED_AUTHSERV` to the server that added the topmost one.

## Tests

`npx vitest run worker` from the repository root (a fake D1 over SQLite); type-check with
`npx tsc -p worker/tsconfig.json`.
