# Postique

**Self-hosted email infrastructure for applications.**

Postique is a locally hosted email and identity platform: design MJML templates, send from your own domain, receive threaded replies, manage conversations, automate approved FAQ responses, store email assets, and authenticate the users of your application. It runs on your machine or VPS with SQLite and your own SMTP infrastructure.

There is no Supabase, Cloudflare, Amazon SES or other hosted service in the runtime path.

![Postique marketing site](docs/marketing.png)

## What is included

- **Local account system**: first-run owner setup, scrypt password hashing, HTTP-only sessions, CSRF protection, login rate limiting.
- **SQLite database**: schema migrations, WAL mode, foreign keys and a local data directory.
- **Template Studio**: browser MJML editor, live preview, server-side MJML compilation, variables, test sends, draft/published versions.
- **Sending API**: REST API, browser SDK, bearer API keys, public browser keys with origin/template/recipient restrictions, idempotency keys, attachments and usage limits.
- **Ephemeral email verification**: developer-designed verification emails, single-use links, secret-key status checks and automatic purge — no user account created.
- **BYOA campaigns**: developer-supplied recipient batches, CSV/provider exports, template personalization, batching, progress, pause/resume, scheduling, analytics and temporary retention.
- **Optional application accounts**: workspace-scoped end-users, email/password signup, JWT access tokens, rotating refresh sessions, magic links, email OTP, recovery and a browser auth SDK.
- **Embedded inbox**: a scoped external-user API plus a themable `<postique-inbox>` web component with authenticated live refresh and polling fallback.
- **Threading**: Message-ID, In-Reply-To and References headers; stable reply subjects; per-thread reply addresses.
- **Inbound SMTP**: built-in listener that receives replies, parses MIME, stores attachments, matches threads and keeps unmatched messages for manual linking.
- **Outbound SMTP and routing**: file outbox for testing, per-domain SMTP relay, direct-to-MX, or a signed HTTP mail gateway. DKIM keys are generated locally per sending domain.
- **Dashboard inbox**: conversation view, labels, search, template replies, conversation metadata and manual linking.
- **Logs and events**: message-level status, event history, CSV export and signed webhooks.
- **Approved FAQ automation**: deterministic local matching, optional auto-send, confidence thresholds and human review.
- **Local assets**: uploads stored under `DATA_DIR`, direct URLs, public/private access.
- **First-run empty states** and onboarding — new installations do not contain demo data.

## Requirements

- Node.js **24 or newer** (the server uses the built-in `node:sqlite` module).
- npm.
- For real outbound delivery: an SMTP relay account **or** a host with outbound port 25 and proper DNS.
- For real inbound email: an MX record pointing at this host, port 25 (or a port mapped by your reverse proxy/firewall), and TLS if possible.

## Quick start

```bash
git clone <this repository>
cd Postique_web
npm install
cp .env.example .env
npm run build
npm start
```

Open `http://localhost:3000`. The first visit asks you to create the owner account and workspace.

![First-run workspace setup](docs/setup.png)

For development with hot reload:

```bash
npm run dev
```

This starts the API on `:3000` and Vite on `:5173` with proxying for `/api`, `/v1`, `/media`, `/sdk` and `/inbound`.

### Safe local test mode

The default `MAIL_TRANSPORT=file` writes every outbound message as an `.eml` file under `DATA_DIR/outbox`. The UI clearly shows this state at the top of the overview. Use it to verify templates, headers, threading and DKIM without sending to real recipients.

Switch to real delivery:

```env
MAIL_TRANSPORT=smtp
SMTP_URL=smtp://user:password@smtp.example.com:587
```

Or direct-to-MX (requires a host that can make outbound port 25 connections):

```env
MAIL_TRANSPORT=direct
SMTP_HELO_NAME=mail.yourdomain.com
```

After changing `.env`, restart Postique.

## First-run setup

1. Open the app and create the owner account.
2. Add a sending domain under **Domains**.
3. Publish the generated SPF, DKIM and DMARC records at your DNS host.
4. Click **Verify domain**. Manual verification is available for local/private deployments (`ALLOW_MANUAL_DOMAIN_VERIFICATION=true`).
5. Add a sender identity.
6. Publish a template in **Template Studio**.
7. Create a secret API key in **Developers**.
8. Send a test through the API or the Studio. The queue and worker handle delivery.

## Use your own domain

Nothing in the runtime requires `postique.fyi`. The domain in the marketing content and demo screenshots is branding/sample data only.

When you clone the repository, set:

```env
APP_URL=https://mail.yourdomain.com
INBOUND_DOMAIN=in.yourdomain.com
MAIL_FROM_DOMAIN=yourdomain.com
```

Then add `yourdomain.com` under **Domains**, choose a delivery route, and publish its DNS records. Another installation can use `postique.com`, `example.org`, or a private domain without changing code.

The test suite uses synthetic `.test` addresses and the file outbox, so it does not require any public domain, DNS record or real SMTP server.

## Configuration

Copy `.env.example` to `.env`. The important values:

| Variable | Purpose |
| --- | --- |
| `APP_URL` | Public base URL. Used in links, media URLs and cookie security. |
| `MAIL_FROM_DOMAIN` | Sending-domain fallback for service email; set to your own domain. |
| `PORT` | HTTP API/dashboard port (default `3000`). |
| `DATA_DIR` | SQLite database, assets, attachments, outbox and generated app secret. |
| `APP_SECRET` | Optional explicit secret. If omitted, generated at `DATA_DIR/.app-secret`. |
| `SECURE_COOKIES` | Set `true` when serving over HTTPS. |
| `INBOUND_SMTP_ENABLED` | Start the built-in inbound SMTP listener. |
| `INBOUND_SMTP_PORT` | Inbound SMTP port (default `2525`; use `25` on a public MX host). |
| `INBOUND_DOMAIN` | Domain used for reply addresses, e.g. `in.example.com`. |
| `INBOUND_TLS_KEY` / `INBOUND_TLS_CERT` | Optional STARTTLS key/certificate. |
| `INBOUND_HTTP_SECRET` | Optional secret for the raw HTTP inbound bridge used by Postfix/Haraka. |
| `MAIL_TRANSPORT` | `file`, `smtp`, `direct` or `http`. |
| `SMTP_URL` | SMTP relay URL when `MAIL_TRANSPORT=smtp`. |
| `MAIL_ADAPTER_URL` | HTTP mail gateway URL when `MAIL_TRANSPORT=http`. |
| `MAIL_ADAPTER_TOKEN` | Bearer/HMAC token shared with the HTTP mail gateway. |
| `MAIL_ADAPTER_TIMEOUT_MS` | HTTP mail adapter timeout (default `20000`). |
| `SPF_RECORD` | SPF record shown in domain setup. Match your actual sending path. |
| `DKIM_SELECTOR` | DKIM selector (default `postique`). |
| `SEND_LIMIT_PER_HOUR` / `MONTHLY_SEND_LIMIT` | Local sending limits. |
| `PUBLIC_SEND_PER_MINUTE` | Per-IP public-key send limit (default `20`). |
| `PUBLIC_KEY_PER_MINUTE` | Global per-public-key send limit across all IPs (default `60`). |
| `PUBLIC_SEND_PER_DAY` | Per-public-key 24-hour send cap (default `500`). |
| `PUBLIC_VERIFY_PER_HOUR` | Per-IP public-key verification-email limit (default `5`). |
| `PUBLIC_VERIFY_PER_DAY` | Per-public-key 24-hour verification-email cap (default `20`). |
| `ALLOW_PRIVATE_WEBHOOKS` | Allow webhooks to private/LAN addresses. Keep `false` on public servers. |
| `WORKER_ENABLED` | Run the send/retry/webhook worker inside the API process. |
| `WORKER_CONCURRENCY` | Jobs processed concurrently per worker process (default `1`). |
| `AUTH_ACCESS_TOKEN_TTL` | Application JWT lifetime in seconds (default `3600`). |
| `AUTH_REFRESH_TOKEN_DAYS` | Application refresh-session lifetime (default `30`). |
| `AUTH_MAGIC_LINK_MINUTES` / `AUTH_OTP_MINUTES` | Magic-link and email-code expiry. |
| `AUTH_DEBUG_LINKS` | Return generated magic links in local/development responses. Keep off on a public server. |
| `EMBED_TOKEN_MINUTES` | Embedded inbox session lifetime (default `60`). |
| `VERIFY_TOKEN_MINUTES` | Verification-link lifetime (default `30`). |
| `VERIFY_RETENTION_HOURS` | How long verification records are retained (default `24`). |
| `VERIFY_PROOF_MINUTES` | Lifetime of the signed Ed25519 proof (default `15`). |
| `TURNSTILE_SECRET_KEY` | Optional Cloudflare Turnstile secret for public verification requests. |
| `CAMPAIGN_BATCH_SIZE` | Recipients processed per campaign batch (default `50`). |
| `CAMPAIGN_MAX_RECIPIENTS` | Per-campaign recipient cap (default `100000`). |
| `CAMPAIGN_RETENTION_DAYS` | Recipient data retention (default `30`). |

### Delivery routes

Postique supports all delivery shapes without changing the application API:

- `direct` — connect directly to recipient MX servers from a VPS with port 25, a static IP and a matching PTR.
- `smtp` — send through a self-hosted Postfix relay, an existing mailbox SMTP account, or a provider such as SES/Postmark/Mailgun over SMTP. This is the recommended production route because the provider owns IP reputation and bounce handling.
- `http` — send DKIM-signed raw MIME to a small HTTP mail gateway.

The installation-wide default comes from `MAIL_TRANSPORT`. A domain can override it under **Domains → Delivery route**, so different sender domains can use different relays or direct delivery. Route credentials are encrypted in SQLite.

Postique retries the selected route; it does not silently switch routes mid-send, because a timeout after the gateway accepted a message can produce duplicate email. Put failover at the adapter/relay layer where it can use idempotency keys.

The HTTP gateway contract and reference implementation are in [adapter/README.md](adapter/README.md) and [adapter/server.mjs](adapter/server.mjs). Run it with `npm run adapter` after setting `ADAPTER_TOKEN` and `SMTP_URL`. The gateway receives raw MIME, verifies an HMAC signature and relays it over SMTP. Postique keeps the durable queue, retries, DKIM signing and delivery events; the gateway only performs the SMTP hop.

A serverless adapter can be a useful control plane, but it is not a substitute for a mail host: raw SMTP is often blocked, egress IPs are not stable, and serverless cannot receive MX mail. Run the sender/gateway on a VPS or use an HTTP email provider from the adapter.

### Inbound mail

Point the MX record for your inbound domain at this host. For a public deployment, allow inbound TCP port 25 and map it to `INBOUND_SMTP_PORT` (or set the port to `25` directly). Reply addresses look like:

```
t_<thread-token>@in.example.com
```

Replies are matched by `In-Reply-To`/`References` first, then the reply token, then sender + subject. Unmatched mail is never discarded; it appears in the inbox for manual linking.

For Postfix, Haraka or another MTA, you can instead pipe raw MIME to:

```bash
curl -X POST http://localhost:3000/inbound/http \
  -H "X-Postique-Inbound-Secret: $INBOUND_HTTP_SECRET" \
  -H "X-Postique-Rcpt: t_token@in.example.com" \
  --data-binary @message.eml
```

### TLS and reverse proxy

Put Postique behind a TLS-terminating reverse proxy (Caddy, nginx, Traefik) and set:

```env
APP_URL=https://mail.example.com
SECURE_COOKIES=true
```

The built-in SMTP listener is separate from HTTP. If you expose it publicly, provide `INBOUND_TLS_KEY` and `INBOUND_TLS_CERT` and publish an MX record.

## API

Create a secret key under **Developers**. Send with:

```bash
curl -X POST http://localhost:3000/v1/send \
  -H "Authorization: Bearer $POSTIQUE_KEY" \
  -H "Idempotency-Key: order-4821" \
  -H "Content-Type: application/json" \
  -d '{
    "from": "orders@example.com",
    "to": ["customer@example.com"],
    "template": "order-confirmation",
    "variables": { "name": "Amara", "order_id": "AC-4821" },
    "thread_id": "thr_existing"
  }'
```

Useful endpoints:

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/v1/send` | Send a template or raw HTML/text. |
| `POST` | `/v1/verifications` | Public-key verification email for a visitor. |
| `GET` | `/v1/verifications/:id` | Public-key verification status. |
| `POST` | `/v1/threads/:id/reply` | Send a reply inside an existing thread (secret key). |
| `PATCH` | `/v1/threads/:id` | Attach or clear the `external_user_id` that owns a thread (secret key). |
| `GET` | `/v1/threads` | List conversations (secret key; end-users use `/embed/v1`). |
| `GET` | `/v1/threads/:id` | Read a conversation and its messages (secret key). |
| `GET` | `/v1/messages/:id` | Read a message (secret key). |
| `POST` | `/v1/templates/:slug/render` | Render a published template without sending. |
| `GET` | `/v1/me` | Identify the API key/workspace. |
| `POST` | `/verify/v1/requests` | Create an ephemeral email verification. |
| `GET` | `/verify/v1/requests/:id` | Check whether an email was verified. |
| `POST` | `/v1/campaigns` | Create a BYOA campaign draft. |
| `POST` | `/v1/campaigns/:id/recipients` | Append a recipient batch. |
| `POST` | `/v1/campaigns/:id/recipients/csv` | Append recipients from a CSV export (`email,name,external_user_id`). |
| `POST` | `/v1/campaigns/:id/start` | Start or resume campaign delivery. |
| `POST` | `/v1/campaigns/:id/schedule` | Schedule a draft campaign for later. |
| `GET` | `/v1/campaigns/:id/analytics` | Delivery rate, status counts, recipient domains, daily volume and top errors. |

### Public-key security model

Public browser keys are intentionally narrow:

- A key must have at least one allowed recipient, one allowed published template and one allowed origin.
- The `Origin` header is required and must match the allow-list. A copied key cannot be used from curl.
- Public keys cannot use `cc`, `bcc`, `thread_id` or `in_reply_to`.
- Sends are limited per IP, globally per key and to a 24-hour per-key cap (`PUBLIC_SEND_PER_DAY`).
- The workspace hourly/monthly limits remain the final backstop.

Use a secret key from a trusted server for arbitrary customer recipients, conversation replies, campaigns or anything that needs the full API. A public key is not a replacement for server-side authorization.

### Verified visitor sends

For the EmailJS-style “send a receipt to the visitor who just submitted a form” flow, use a public key with the **verified visitor** recipient policy. The visitor must first prove ownership:

1. Browser calls `POST /v1/verifications` with the public key and the visitor email.
2. Postique sends a verification email. The request is linked to that public key and rate-limited per IP/day.
3. The visitor opens the link. The browser polls `GET /v1/verifications/:id` until `status` is `verified`.
4. Browser calls `POST /v1/send` with `verification_id` and exactly one `to` address. The proof must match the email, belong to the key, be unexpired and unused.
5. The proof is consumed. A second send needs a new verification.

The browser SDK exposes `verify()` and `verification()` alongside `send()`. Received proofs can still go to an address on the key's fixed recipient list without verification.

This is double opt-in, not general public relay. It also means an attacker cannot make a browser key mail an arbitrary address that has not confirmed ownership.

Browser SDK: load `/sdk/postique.js` and use a **public** key. Public keys require an allowed origin and at least one allowed published template. Fixed-recipient keys also require an explicit recipient allow-list; verified-visitor keys allow a new recipient only with a consumed verification proof. Public keys cannot use `cc`, `bcc`, `thread_id` or `in_reply_to`, and they must send from an allowed browser `Origin`.

Fixed-recipient public keys are for known addresses. Verified-visitor public keys can reach a new address only after that visitor confirms ownership. For arbitrary recipients without double opt-in, use a secret key from your backend.

```html
<script src="https://mail.example.com/sdk/postique.js"></script>
<script>
  const postique = new Postique("pq_pub_...", {
    baseUrl: "https://mail.example.com"
  });
  postique.send({
    template: "contact-receipt",
    to: "customer@example.com",
    variables: { name: "Wanjiru" }
  });
</script>
```

For a verified visitor, request the proof first and pass its ID with a single recipient:

```js
const { verification, browser_token } = await postique.verify({
  email: "visitor@example.com",
  name: "Visitor",
});
// after the visitor confirms, poll until status === "verified":
const result = await postique.verification(verification.id, browser_token);
await postique.send({
  template: "receipt",
  to: "visitor@example.com",
  verification_id: verification.id,
});
```

`result.verification.proof` is a short-lived Ed25519 JWT that can be attached to the form submission and verified by any backend or frontend using `/verify/v1/jwks.json`.

## Email verification without accounts

This is the lightweight ownership check. It does **not** create an `auth_users` row, a password, a session or a long-lived profile.

![Ephemeral email verification](docs/verification.png)

A developer creates a request with a secret key and a published Template Studio template:

```bash
curl -X POST https://mail.example.com/verify/v1/requests \
  -H "Authorization: Bearer $POSTIQUE_SECRET_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "person@example.com",
    "template": "verify-email",
    "redirect_url": "https://app.example.com/verified",
    "metadata": { "submission_id": "sub_123" }
  }'
```

Template variables include `verify_url`, `verification_code`, `email`, `name`, `workspace` and any metadata keys. The developer designs the email in Template Studio; a built-in fallback is used when no template is supplied.

The email contains a link and a six-digit code. Opening `GET /verify/v1/confirm?token=...` shows a confirmation page and does **not** mark the address verified, so corporate link scanners cannot consume the link. The human clicks the button (a POST), which verifies and redirects to the stored redirect URL with `verification_id` and `verification=success`.

The backend can confirm the result:

```http
GET /verify/v1/requests/vrf_...
Authorization: Bearer pq_live_...
```

For frontend-only sites, use a public key with the **verified visitor** policy:

```http
POST /v1/verifications
Authorization: Bearer pq_pub_...
Origin: https://app.example.com

{ "email": "visitor@example.com", "name": "Visitor" }
```

This returns `verification.id`, `browser_token`, and (in development) a debug link/code. The browser polls:

```http
GET /v1/verifications/vrf_...
Authorization: Bearer pq_pub_...
X-Postique-Browser-Token: <browser_token>
Origin: https://app.example.com
```

Once verified, the response includes a signed `proof`. The code alternative is:

```http
POST /v1/verifications/vrf_.../confirm-code
Authorization: Bearer pq_pub_...
X-Postique-Browser-Token: <browser_token>
Origin: https://app.example.com

{ "code": "123456" }
```

The proof is an Ed25519 JWT with `iss`, `aud` (the browser origin), `sub`, `email`, `workspace_id`, `api_key_id`, `iat` and `exp`. Verify it using `/verify/v1/jwks.json`; no Postique secret is needed. The proof expires after 15 minutes and the verification record is purged after 24 hours.

Public-key verification requests require the key’s fixed verification template or the built-in template. Optional Cloudflare Turnstile is enabled by setting `TURNSTILE_SECRET_KEY`; per-IP, per-key and per-email limits apply.

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/verify/v1/requests` | Create a verification with a secret key. |
| `GET` | `/verify/v1/confirm?token=...` | Human confirmation page (no state change). |
| `POST` | `/verify/v1/confirm` | Confirm the link token from the page. |
| `GET` | `/verify/v1/requests/:id` | Check status with a secret key. |
| `GET` | `/verify/v1/jwks.json` | Public Ed25519 proof verification keys. |
| `POST` | `/v1/verifications` | Create a public-key, browser-bound verification. |
| `GET` | `/v1/verifications/:id` | Browser-bound status and proof. |
| `POST` | `/v1/verifications/:id/confirm-code` | Confirm the emailed six-digit code. |

Use **Application accounts** only when you need persistent users, passwords, JWTs and refresh sessions.

## BYOA campaigns

The campaign engine is designed for developers who keep their own user database.

![BYOA campaigns](docs/campaigns.png)

- The developer pushes recipient batches to Postique.
- Postique stores recipients only for the campaign retention window.
- No permanent contacts database or user graph is required.
- Recipients are processed in batches through the existing queue and per-domain delivery routes.
- Each recipient gets a real message record, retry behavior and delivery event.
- Campaigns can be started, paused, resumed and cancelled.
- Campaign messages include a signed unsubscribe link and `List-Unsubscribe` headers by default. The `/unsubscribe/:id?token=...` endpoint adds the address to the workspace suppression list. Set `"options": { "unsubscribe": false }` only for messages where unsubscribe is not appropriate, such as legal notices.

Create a draft:

```bash
curl -X POST https://mail.example.com/v1/campaigns \
  -H "Authorization: Bearer $POSTIQUE_SECRET_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Privacy policy update",
    "template": "policy-update",
    "recipients": [
      { "email": "amara@example.com", "name": "Amara", "external_user_id": "user_123" },
      { "email": "buyer@example.com", "name": "Buyer", "external_user_id": "user_456" }
    ]
  }'
```

Then `POST /v1/campaigns/:id/start`, or use **Campaigns** in the dashboard. The API also supports appending batches with `POST /v1/campaigns/:id/recipients`, so a large audience can be streamed in chunks rather than stored permanently. Provider exports can be appended with `POST /v1/campaigns/:id/recipients/csv` (CSV columns `email,name,external_user_id`), which is designed to accept Mailchimp, spreadsheet or S3 CSV exports without adding a provider-specific credential store. Pass `scheduled_at` at creation time, or call `POST /v1/campaigns/:id/schedule`, to have the worker start a draft later.

Current defaults are 50 recipients per batch and 100,000 recipients per campaign, configurable through `CAMPAIGN_*` environment variables. This is a single-node queue profile; for millions of messages per hour, replace SQLite with a distributed queue/database and run a worker fleet.

Campaign analytics are delivery-oriented: status counts, delivery rate, recipient-domain distribution, daily volume and grouped errors. They do not add open pixels or click redirects; those create privacy and reputation obligations that belong to a separate decision.

### Scaling the queue

The queue is durable and retry-safe, but the default storage is SQLite and the default worker is a single Node process. That is appropriate for self-hosted transactional mail and moderate campaigns.

For higher throughput:

1. Move the database to PostgreSQL and the job queue to Redis Streams, PostgreSQL `SKIP LOCKED`, SQS or Kafka.
2. Run multiple `npm run worker` processes with `WORKER_ENABLED=false` on the API process.
3. Add per-recipient-domain rate limiting and connection pooling at the worker layer.
4. Split provider routes by domain/IP pool and monitor queue lag, deferrals and reputation.

The application API and job payloads are designed to remain the same when the queue backend changes. AWS SES-scale delivery additionally requires an MTA fleet, IP reputation management, abuse handling and feedback loops — not just more workers.

## Application authentication

Postique also includes an optional application account pool. It is intentionally separate from the dashboard owner and from the ephemeral Verification API. Use it only when a product needs persistent users, passwords and sessions; otherwise use `/verify/v1`. Dashboard accounts still use the local session/CSRF system; application accounts get JWTs and refresh sessions.

![Authentication management](docs/authentication.png)

Everything is workspace-scoped. The workspace public key identifies the application, and its allowed origins apply to auth requests exactly as they do to sending. Create a **public** key in **Developers** and set the app’s exact origins.

### Endpoints

All endpoints are under `/auth/v1` and use the same public key as the browser SDK:

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/auth/v1/signup` | Create an email/password account. |
| `POST` | `/auth/v1/token?grant_type=password` | Sign in with email and password. |
| `POST` | `/auth/v1/token?grant_type=refresh_token` | Rotate a refresh session. |
| `POST` | `/auth/v1/otp` | Send a magic link and six-digit code. |
| `POST` | `/auth/v1/verify` | Exchange a link or code for a session. |
| `POST` | `/auth/v1/recover` | Send a password-recovery link. |
| `POST` | `/auth/v1/logout` | Revoke the access/refresh session. |
| `GET` | `/auth/v1/user` | Read the current application user. |
| `PUT` | `/auth/v1/user` | Update name, metadata or password. |
| `GET` | `/auth/v1/settings` | Public auth feature flags and endpoints. |

A session response contains `access_token`, `refresh_token`, `token_type`, `expires_in`, `expires_at` and `user`. The access token is an HS256 JWT signed with a key derived from `APP_SECRET`; refresh tokens are stored hashed and rotate on every use. Revoking a session makes its access token unusable immediately.

### Browser SDK

```html
<script src="https://mail.example.com/sdk/postique.js"></script>
<script>
  const postique = new Postique("pq_pub_...", {
    baseUrl: "https://mail.example.com"
  });

  await postique.auth.signUp({
    email: "customer@example.com",
    password: "a-long-password",
    data: { name: "Amara" }
  });

  await postique.auth.signIn({
    email: "customer@example.com",
    password: "a-long-password"
  });

  // Passwordless:
  await postique.auth.signInWithOtp({ email: "customer@example.com" });
  await postique.auth.verifyOtp({ email: "customer@example.com", token: "123456" });

  const user = await postique.auth.getUser();
  await postique.auth.signOut();
</script>
```

The SDK persists the session in `localStorage` under a key scoped to the public key. Pass a custom `storage` option when running in an environment without localStorage.

Magic links are delivered through the configured SMTP transport. With `MAIL_TRANSPORT=file`, they are written to `DATA_DIR/outbox`; in local development `AUTH_DEBUG_LINKS=true` also returns the generated link/code from the admin **Authentication** page. Never enable that on a public server.

### Admin controls

Open **Authentication** in the workspace sidebar to:

- see end-users, verification state, session counts and recent signups;
- enable or disable signups, password login, magic links and email-verification enforcement;
- send a one-time link, disable an account or delete it;
- copy the browser SDK snippet and inspect the API surface.

Users can be disabled or deleted without affecting the workspace owner account. Deleting an end-user removes their sessions and pending tokens immediately.

### Magic-link redirects

Pass a `redirect_to` value when requesting a link. It is validated against the public key’s allowed origins and stored with the token. After verification the browser is redirected to that URL with the session in the URL fragment:

```
#access_token=...&refresh_token=...&token_type=bearer&expires_in=3600&type=magiclink
```

Applications should parse the fragment, call `postique.auth.setSession(...)` (or store the tokens themselves), and remove the fragment from the address bar.

## Embedded inbox

The embedded inbox is now a real, scoped surface — not a mock preview. It is built around the application’s **own user ID**, so you do not have to move existing users into Postique auth.

![Embedded inbox widget](docs/embedded-inbox.png)

### 1. Give a conversation an owner

When your backend sends the first email for a user, include `external_user_id`:

```json
{
  "from": "support@example.com",
  "to": ["customer@example.com"],
  "template": "order-update",
  "external_user_id": "user_123"
}
```

That id is stored on the conversation. A thread with no `external_user_id` is not visible to the embedded API. To map an existing conversation without sending another email:

```bash
curl -X PATCH https://mail.example.com/v1/threads/thr_... \
  -H "Authorization: Bearer $POSTIQUE_SECRET_KEY" \
  -H "Content-Type: application/json" \
  -d '{"external_user_id":"user_123"}'
```

### 2. Mint a short-lived inbox session on your server

Use a **secret** API key. Never put that key in browser code.

```bash
curl -X POST https://mail.example.com/embed/v1/session \
  -H "Authorization: Bearer $POSTIQUE_SECRET_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "external_user_id": "user_123",
    "email": "customer@example.com",
    "name": "Amara",
    "origin": "https://app.example.com"
  }'
```

The response contains a 60-minute `token` bound to that workspace, external user ID and origin. Your backend returns it to the browser; the browser never receives the secret key.

### 3. Embed the prebuilt widget

```html
<script src="https://mail.example.com/sdk/postique-inbox.js"></script>

<postique-inbox
  base-url="https://mail.example.com"
  token="eyJ..."
  theme="light"
  accent="#C6F26B"
  height="560"
  branding="true"
></postique-inbox>
```

Add `thread-id="thr_..."` to open a single conversation; omit it to show the user’s conversation list.

Supported attributes include `base-url`, `token`, `thread-id`, `theme` (`light`/`dark`), `accent`, `radius`, `height`, `title` and `branding`.

Widget events:

- `postique:ready`
- `postique:thread.opened`
- `postique:reply.sent`
- `postique:session.expired`
- `postique:error`

When the token expires, listen for `postique:session.expired`, mint a fresh token on your server and call `widget.setToken(nextToken)` (or update the `token` attribute). The widget also exposes `refresh()`.

The widget opens an authenticated server-sent-event stream at `/embed/v1/events` and refreshes on thread changes. Browsers without streaming support fall back to 15-second polling.

```js
document.querySelector('postique-inbox').addEventListener('postique:reply.sent', (event) => {
  console.log(event.detail.threadId);
});
```

### Scoped API

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/embed/v1/session` | Server-to-server exchange for a short-lived token. |
| `GET` | `/embed/v1/session` | Read the current embedded user. |
| `GET` | `/embed/v1/threads` | List only this external user’s conversations. |
| `GET` | `/embed/v1/threads/:id` | Read one owned conversation; marks it read. |
| `POST` | `/embed/v1/threads/:id/messages` | Send a reply. |
| `GET` | `/embed/v1/attachments/:id?token=...` | Access an attachment owned by this user. |

All embed routes use the short-lived token, not the workspace secret. The token’s origin claim is checked for browser requests, and attachments are scoped to the same user. The headless API is the same data used by the prebuilt widget, so you can build a completely custom UI.

## Webhooks

Add an endpoint in **Developers**. Requests are JSON and signed with HMAC-SHA256:

```
X-Postique-Event: thread.reply_received
X-Postique-Delivery: whd_...
X-Postique-Signature: sha256=<hex>
```

Verify the signature against the raw request body using the webhook secret shown once at creation. Events: `message.sent`, `message.failed`, `message.bounced`, `message.complained`, `thread.reply_received`, `verification.completed`, `campaign.scheduled`, `campaign.started`, `campaign.paused`, `campaign.resumed`, `campaign.completed`, `campaign.cancelled`.

Destinations are DNS-resolved and rejected if any address is private, loopback, link-local or CGNAT. Redirects are not followed. Set `ALLOW_PRIVATE_WEBHOOKS=true` only for local development.

## Operations

### Data and backups

Everything lives in `DATA_DIR`:

```
data/
  postique.db        SQLite database
  postique.db-wal    WAL file (may exist)
  uploads/           public/private assets
  attachments/       inbound and outbound attachments
  outbox/            .eml files when MAIL_TRANSPORT=file
  .app-secret        generated encryption/session secret
```

Back up the whole directory, not just the `.db` file. If SQLite is running, use the SQLite backup API or stop the service first. Do not commit `data/` or `.env`.

### Admin recovery

If the owner password is lost, reset it from the host running Postique:

```bash
npm run password:reset -- owner@example.com "a-new-long-password"
```

This updates the password and revokes all existing sessions.

### Worker

By default the API process runs the worker. For a separate worker process:

```env
WORKER_ENABLED=false
```

then run:

```bash
npm run worker
```

### Queue operations

The dashboard **Queue** page shows pending, running, completed and failed jobs for the workspace. Failed send, campaign, scheduled-start and webhook jobs can be retried; pending or failed jobs can be cancelled. Scheduled campaign starts are ordinary queue jobs and survive a process restart.

A cancelled campaign marks pending recipients and unsent messages as cancelled. The worker checks the campaign state before delivering a queued message, so cancellation does not rely on deleting queue rows.

### Docker

```bash
cp .env.example .env
docker compose up -d --build
```

The compose file mounts a persistent volume at `/data` and exposes `3000` (HTTP) and `2525` (inbound SMTP). Map inbound port 25 at your host/proxy if you want to receive internet mail.

The optional `mail-gateway` service runs the HTTP adapter on port `8787`:

```bash
docker compose --profile mail-gateway up -d --build
```

Then point `MAIL_ADAPTER_URL` at `http://mail-gateway:8787/v1/deliver`.

### Tests and build

```bash
npm run build
npm test
```

Unit tests cover password hashing, address parsing, threading subjects, FAQ matching, JWT claims, token tampering, ephemeral verification records, unsubscribe tokens, public-key policy, webhook destinations/signatures and campaign CSV parsing. The build is a Vite production build served by the Node server.

## Production checklist

- [ ] Set `APP_URL` to the public HTTPS URL.
- [ ] Set `SECURE_COOKIES=true` behind TLS.
- [ ] Use an explicit `APP_SECRET` or preserve the generated `DATA_DIR/.app-secret`.
- [ ] Configure `SMTP_URL` or `direct` transport and test a real send.
- [ ] Publish SPF, DKIM and DMARC; verify the domain.
- [ ] Point MX at the inbound SMTP listener and test a reply from Gmail/Outlook.
- [ ] Set `ALLOW_MANUAL_DOMAIN_VERIFICATION=false` after DNS is working.
- [ ] Keep `ALLOW_PRIVATE_WEBHOOKS=false` on a public server.
- [ ] Set `AUTH_DEBUG_LINKS=false` and verify magic links through real SMTP.
- [ ] Restrict public-key allowed origins to the exact application origins.
- [ ] Back up `DATA_DIR` on a schedule.
- [ ] Put the HTTP server behind a TLS reverse proxy.
- [ ] Monitor bounce/complaint rates and the suppression list.
- [ ] Restrict access to `.env` and `DATA_DIR`.

## Deliberately excluded

- OAuth/social sign-in and enterprise SAML (the local pool covers email/password and magic links).
- TOTP/MFA and passkeys.
- Gmail/Outlook OAuth mailbox synchronization.
- Generic mailbox imports.
- Campaign open/click analytics and third-party audience sync (BYOA campaign delivery itself is included).
- Deep structural customization of the prebuilt widget beyond theme tokens, slots and the headless API.

## Stack

- Node.js, Express, built-in `node:sqlite`, `nodemailer`, `smtp-server`, `mailparser`, `mjml`, `handlebars`, `sanitize-html`.
- `node:sqlite` is a young API. Pin a known Node release in production and run the migrations against a copy of the database before upgrading Node.
- React 19, Vite, Lucide, Manrope and Instrument Serif.
- `data/` for storage; no external database, queue, auth or email provider is required.
