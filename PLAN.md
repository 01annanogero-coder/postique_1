# Postique - Email Studio (Annan Digital Labs)

> Historical planning document. The current implementation is described in [README.md](README.md). Where this plan mentions Supabase, Cloudflare, Vercel or Amazon SES, those are no longer runtime dependencies; Postique is self-hosted with SQLite, local SMTP routing and an optional HTTP mail adapter.

Status: planning. Date: 2026-11-02. Owner: Annan Ogero.
Predecessor: `C:\Users\01Ann\Projects\mjml-app-master` (desktop prototype, personal tool).

## 1. Product in one paragraph

Postique is a hosted email studio for developers. You design templates (MJML + variables), then send
them through a simple API or browser SDK, including as **replies that stay in one conversation**.
Replies from recipients come back to you as webhooks and in a dashboard inbox. It is the product
EmailJS, Mailjet and Gmail each do a third of: EmailJS-style simple sending, Mailjet-style
templates and deliverability, Gmail-style organised conversations.

Why it exists (the gaps we fix):
- EmailJS cannot send a saved template to an arbitrary recipient as a real send, and cannot reply inside an existing conversation.
- Gmail cannot send designed HTML.
- Nothing combines "send a designed template" with "keep the thread" with "react to replies".

## 2. Target customer and MVP promise

First customers: developers (freelancers, agencies, small SaaS) who want an EmailJS-style API.
Small Kenyan businesses mostly use WhatsApp, so they are reached later, through developers who build for them.

MVP promise: **"Design a template, get an API key, send a threaded, designed email in five minutes."**

## 3. MVP scope

In:
1. Accounts and workspaces (email + password, GitHub login optional).
2. Template Studio: browser MJML editor, live preview, variables (`{{name}}`), test send, versioning (draft/published).
3. Sending domains: add a domain, show DNS records (SPF, DKIM, return-path), verify, status.
4. API keys: secret keys (server) and public keys (browser, restricted by allowed origins).
5. Send API: send a template or raw HTML/text, with variables, attachments (small), idempotency key.
6. Threaded replies: send with `thread_id` or `in_reply_to`, headers built correctly, one conversation.
7. Inbound replies: per-workspace reply address, parsed and attached to the right thread, delivered by webhook and shown in the inbox.
8. Browser SDK (EmailJS-style): one script tag / npm package, public key, origin allow-list, rate limit, captcha hook.
9. Logs: every message with status (queued, sent, delivered, bounced, complained, replied), searchable.
10. Dashboard inbox: conversations list, thread view (safe rendering), labels, search, reply using a template.
11. Usage metering and a free tier. Paid plans wired after the first real users.

Out of MVP (deliberately):
- AI features (see section 9 for decisions to make now so they are cheap later)
- Gmail/Outlook OAuth mailbox connection
- Generic IMAP/SMTP mailbox import
- Campaigns, bulk blasts, scheduling, open/click tracking
- Template marketplace (keep the existing postique.fyi marketplace as is for now)
- Teams and roles beyond owner/member

## 4. Architecture

```
 Browser SDK / REST clients                Dashboard (Next.js, Vercel)
          |                                         |
          v                                         v
   API (Next.js route handlers or Hono)  ----->  Supabase (Postgres + Auth + Storage, RLS)
          |                                         ^
          v                                         |
   Queue (Postgres-backed to start) ---> Worker (always-on, on a VPS)
                                              |  send jobs, retries, webhooks out,
                                              |  bounce/complaint handling
                                              v
                              Sending provider adapter  (Amazon SES; others possible later)
                                              ^
   Inbound: Cloudflare Email Routing -> Email Worker -> POST /inbound (signed)
```

Principles:
- **Provider adapter**: our API never talks to a sending provider directly. `send(message) -> providerId`, plus webhook normalisation. Swapping provider is a config change.
- **We own the Message-ID and the headers.** Threading is built from our own records, so it does not depend on any mailbox vendor.
- **Secrets**: customer API keys stored hashed (show once). Any stored credentials use envelope encryption.
- **Multi-tenant from day one**: every row has `workspace_id`; Postgres RLS enforces it; the worker uses a service role and always filters by workspace.
- **Idempotency**: `Idempotency-Key` header on send; duplicate sends return the original result.
- **Serverless where it fits, worker where it does not**: dashboard and API on Vercel; sending, retries and inbound processing on the worker.

## 5. Threading model (ported from the desktop prototype)

Carry over from `src/main/mail/compose.js` and `sync.js`:
- `In-Reply-To` = Message-ID of the message being answered.
- `References` = inherited chain + that id, de-duplicated, oldest first, capped at 20.
- Subject stable; exactly one `Re: ` prefix.
- Inbound matching cascade: (1) `In-Reply-To`/`References` hits a known Message-ID, (2) per-thread reply address token, (3) normalised subject + participants within 30 days, (4) otherwise "unmatched", shown for manual linking, never dropped.

Improvement over the prototype: because we send and receive, step 2 is deterministic.
Reply-To is `t_<token>@in.postique.fyi`, so replies from clients that mangle headers still land in the right thread.

Gmail still groups the recipient's view by its own rules (subject + headers). Keeping the subject
stable and the chain correct is what makes the recipient's Gmail show one conversation.

## 6. Data model (first pass)

```
workspaces(id, name, plan, created_at)
members(workspace_id, user_id, role)
api_keys(id, workspace_id, kind secret|public, prefix, hash, allowed_origins[], last_used_at, revoked_at)
domains(id, workspace_id, name, status, dkim_selector, records jsonb, verified_at)
identities(id, workspace_id, domain_id, from_email, from_name, signature_html)
templates(id, workspace_id, name, slug)
template_versions(id, template_id, version, mjml, variables_schema jsonb, html_compiled, status draft|published)
threads(id, workspace_id, subject, participants jsonb, reply_token, status, last_activity_at)
messages(id, workspace_id, thread_id, direction in|out, author_type human|api|system|ai,
         message_id, in_reply_to, references text[], from, to, cc, subject,
         html, text, template_version_id, provider_id, status, error, created_at)
message_events(id, message_id, type delivered|bounced|complained|opened|clicked|replied, payload, at)
attachments(id, message_id, storage_path, filename, bytes, content_type)
labels(id, workspace_id, name) ; thread_labels(thread_id, label_id)
webhooks(id, workspace_id, url, secret, events[]) ; webhook_deliveries(...)
usage_counters(workspace_id, period, sends, inbound, storage_bytes)
```

## 7. Public API (sketch)

```
POST /v1/send
  { "from": "hello@acme.com", "to": ["a@b.com"],
    "template": "welcome", "variables": {"name": "Wanjiru"},
    "thread_id": "thr_123",            // optional: reply inside this thread
    "idempotency_key": "..." }
  -> { "id": "msg_...", "thread_id": "thr_...", "status": "queued" }

GET  /v1/messages/:id            GET /v1/threads/:id            GET /v1/threads?label=&q=
POST /v1/templates/:slug/render  (preview HTML without sending)
POST webhook -> your URL: message.delivered | message.bounced | thread.reply_received
```

Browser SDK (EmailJS-style): `postique.send({ template, variables, to })` with a public key.
Public-key sends are restricted to allowed origins, rate limited, size limited, and can only
use templates flagged "public sendable", with a fixed recipient list unless explicitly opened.
This is the main abuse surface of the product, so it gets the strictest limits.

## 8. What to port from mjml-app-master

| Take | From | Notes |
|---|---|---|
| Threading headers + dedupe | `src/main/mail/compose.js` | Pure logic; drop IMAP read-back, we own the Message-ID |
| Thread matching cascade | `src/main/mail/sync.js`, `store.js` | Re-implement against Postgres |
| MJML compile + Handlebars pre-pass | `src/helpers/preview-content.js`, `mjml.js` | Use `mjml-browser` in the editor and `mjml` on the server |
| Brand brief / template scanning ideas | `src/main/templates/*` | Becomes workspace branding settings |
| CodeMirror editor setup, autocomplete | `src/helpers/codemirror-*.js` | Reuse, or move to Monaco/CodeMirror 6 |
| Safe HTML rendering approach | `src/components/SafeHtml` | Must be a sandboxed iframe, scripts stripped, remote images blocked by default |
| Do NOT take | Electron shell, IPC, local FS, app-password IMAP, `.profile`, `.env`, `.spike`, `.tools` | Not needed, and some contain secrets |

## 9. AI: decisions to make now so it stays cheap later

Not built in MVP. These cost almost nothing now and avoid a migration later:
1. `messages.author_type` already includes `ai` (section 6). Never infer authorship later.
2. A `drafts` table (thread_id, body, created_by, status) separate from `messages`, so a draft is never a half-sent message. Add it when AI starts, but keep sending code path "draft -> explicit send".
3. Workspace-level `ai_enabled` flag, default off, with a consent record (who agreed, when) because thread content leaves our system to a model provider.
4. Keep plain-text bodies for every message (already in the schema); models work from text, not HTML.
5. Thread-level `automation_state` column (none | draft_only | paused), unused for now.
6. Terms of service and privacy policy must say message content may be processed by third-party AI providers. Write that in at launch, not after.

## 10. Phases

Phase 0 - Foundations (decisions and repo)
- Request SES production access (start the clock), provision the VPS, create Supabase project, Vercel project, repo, CI, env handling.
- Done when: empty app deploys, DB migrations run from the repo, secrets are not in git.

Phase 1 - Accounts, workspaces, keys
- Auth, workspace creation, API key issue/revoke (hashed), RLS tests.

Phase 2 - Template Studio
- Browser MJML editor, preview, variables, versions, test send to yourself.

Phase 3 - Domains and sending
- Domain add/verify flow, identities, `/v1/send`, queue + worker, provider adapter, delivery/bounce webhooks, message logs.

Phase 4 - Threads and inbound
- Reply-To tokens, inbound endpoint, matching cascade, `thread_id` on send, outbound webhooks for replies.
- Acceptance: send to a Gmail address, reply from Gmail, reply arrives as webhook and in the thread; send a second message with `thread_id` and it appears in the same Gmail conversation.

Phase 5 - Browser SDK and dashboard inbox
- SDK package + docs page, origin allow-list, rate limits, captcha hook; inbox UI, labels, search, template reply.

Phase 6 - Billing, abuse controls, launch
- Plans and metering, payment (M-Pesa via Paybill when approved, card via a gateway), suppression lists, unsubscribe handling for any marketing-type send, abuse review, docs, landing page on postique.fyi.

## 11. Decisions

Locked (2026-11-02):
1. **Sending provider: Amazon SES.** Adapter stays in place so a second provider is possible later.
2. **Worker host: a VPS** (always-on process, managed with systemd or a process manager).
3. **Reply domain: `in.postique.fyi`**, handled by a Cloudflare Email Worker that POSTs signed requests to `/inbound`.

SES specifics this implies:
- Each customer domain is created as an SES identity (Easy DKIM); we show the DNS records and poll for verification.
- Bounces and complaints come through a configuration set -> SNS -> our webhook endpoint. Suppression list is ours, in addition to SES's.
- New SES accounts start in the **sandbox** (verified recipients only, low limits). Production access must be requested, with a description of use, bounce/complaint handling and opt-out handling. Approval is not instant, so request it early.
- Inbound is NOT handled by SES; Cloudflare Email Routing does that for `in.postique.fyi`.
- Per-customer sending limits and auto-pause on bad bounce/complaint rates protect our one SES account's reputation.

Still open (not blocking until Phase 6):
4. Payment gateway for card payments, alongside M-Pesa once the Paybill is approved.
5. Free tier size, to be set once SES cost per email is known.

## 12. Risks

| Risk | Mitigation |
|---|---|
| Abuse: public keys used to spam | Origin allow-list, per-key rate limits, fixed recipients by default, new-account sending caps, bounce/complaint thresholds that auto-pause |
| Deliverability reputation | Per-workspace sending domains (their reputation, not ours), suppression list, bounce handling from day one |
| Provider account suspension | Adapter allows a second provider; keep complaint rate low; monitor |
| Inbound HTML is hostile | Sandboxed iframe, strip scripts, block remote content by default |
| Secrets leaking into git | Strict `.gitignore`; never copy `.env` / `.profile` from the prototype |
| Scope creep toward "rebuilding Gmail" | Inbox stays minimal: list, thread, labels, search, reply |

## 13. Repo layout (proposed)

```
Postique/
  apps/web        Next.js dashboard + API routes
  apps/worker     queue consumer, provider adapters, inbound processing
  packages/sdk    browser/node SDK
  packages/core   threading, rendering, shared types
  supabase/       migrations, seed, RLS tests
  docs/           API docs
```
