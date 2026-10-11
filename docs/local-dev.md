# Running Cinder locally against a FHIR server (e.g. HAPI)

Cinder needs three things running: its own Postgres (users, orgs, projects), the
Bun API server, and the Vite dev server. FHIR traffic from the browser goes
`Vite (5173) → Bun (3000) → your FHIR server`.

## 1. Environment

```bash
cp .env.example .env
```

Edit `.env` and set:

```bash
DATABASE_URL=postgresql://cinder:cinder@localhost:5432/cinder
BETTER_AUTH_SECRET=$(openssl rand -base64 32)   # paste the value
BETTER_AUTH_URL=http://localhost:3000
CINDER_DEV_AUTH=true                # email/password sign-in, no Google needed
CINDER_ALLOWED_FHIR_HOSTS=localhost # hosts that "FHIR server" projects may point at
```

`GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` and `CINDER_ENCRYPTION_KEY` can stay
unset unless you also want Google sign-in or Google Cloud Healthcare projects.

## 2. Start everything

```bash
bun run db:up        # Postgres in Docker (docker-compose.yml)
bun run dev:server   # Bun API server on :3000, restarts on change
bun run dev          # Vite on :5173
```

Open http://localhost:5173.

## 3. Sign in and point a project at your FHIR server

1. On the sign-in page use **Local development sign-in**: enter any email and
   password and click **Create account** (later, **Sign in**).

   A dev account already exists in the local database (created 2026-09-06 when
   this setup was first wired up). It only lives in your local Postgres volume
   (`cinder_pgdata`) and means nothing anywhere else:

   | Email             | Password         | Org     | Project                                    |
   | ----------------- | ---------------- | ------- | ------------------------------------------ |
   | `dev@example.com` | `devpassword123` | `Local` | `Local HAPI` → `http://localhost:3447/fhir` |

   If you ever wipe the volume (`docker compose down -v`), just create it again
   with **Create account**.
2. Create an organization.
3. Create a project, choose **FHIR server (HAPI, etc.)**, and enter the base
   URL, for example `http://localhost:3447/fhir` for the ICR HAPI instance.

The project's hostname must be in `CINDER_ALLOWED_FHIR_HOSTS`, otherwise the
server refuses it. This allowlist is what stops a hosted Cinder from being used
as an open proxy, so leave it unset in production unless you mean it.

### Servers that need a token (e.g. FHIR Info Gateway)

Turn on **OAuth client credentials** in the project form and enter the token
URL, client ID and client secret. For the ICR gateway:

| Field         | Value                                                                    |
| ------------- | ------------------------------------------------------------------------ |
| FHIR base URL | `https://gateway.healthcampaigns.org/fhir`                               |
| Token URL     | `https://auth.healthcampaigns.org/realms/icr/protocol/openid-connect/token` |
| Client ID     | an API key's client id, e.g. `key-icrdemo`                               |

Cinder reaches the ICR server only through the gateway. Don't add
`hapi.healthcampaigns.org`, the open address of the same server, to the allowlist.

Both hosts must be in `CINDER_ALLOWED_FHIR_HOSTS`, and the server needs
`CINDER_ENCRYPTION_KEY` (the secret is envelope-encrypted like GCP service
accounts). The token URL, and the base URL of a project with credentials, must
be https unless they point at localhost. The API never returns the secret, only
whether one is saved; leave the field blank when editing to keep it, and enter it
again if you change the token URL or client ID.

## How the proxy handles a plain FHIR server

- Requests to `/fhir/*` are forwarded to `<fhirBaseUrl>/*`. Without client
  credentials no auth header is sent. With them, the proxy gets a token with the
  OAuth client-credentials grant, caches it per project until a minute before it
  expires, sends it as `Authorization: Bearer …`, and on a 401 fetches a new
  token and retries once. Token requests don't follow redirects.
- An upstream 401 (no credentials, or still rejected after the retry) and a
  token endpoint 4xx come back as a 403 OperationOutcome. A 401 would sign the
  user out of Cinder, and Medplum retries 5xx responses.
- `If-None-Match` is not forwarded. The browser's cache is keyed by URL, not by
  project, so its ETags can belong to another server, and FHIR Info Gateway
  returns a 500 when HAPI answers a conditional read with 304.
- HAPI pages with `Bundle.link[next] = <base>?_getpages=…`. The proxy folds that
  query into an opaque `_page_token` on the `next` link, and when the browser
  sends it back as `_cursor`/`_page_token`, the proxy replays the decoded query
  at the server base. The UI uses the same paging code for GCP and HAPI.
- Other Bundle links and `Location` headers that point at the upstream server
  are rewritten to the proxy.
- Responses are streamed unless they are JSON, which is buffered for the link
  rewrite.

## Notes

- `CINDER_DEV_AUTH` is ignored when `NODE_ENV=production`.
- Existing databases are upgraded on server start (`server/db.ts` adds the
  `server_type` and `fhir_base_url` columns and the `fhir_server_credential`
  table). The equivalent Drizzle migrations are
  `drizzle/0002_fhir_server_projects.sql` and `drizzle/0003_fhir_server_credentials.sql`.
- `bun run db:rotate-keys` re-encrypts client secrets as well as service
  accounts.
- `bun run test` runs the browser tests. Server tests run with
  `bun test server/`; `server/routes/credentials.test.ts` needs `DATABASE_URL`.
