# Postique mail adapter

This is a small reference gateway for the `MAIL_TRANSPORT=http` route. It accepts DKIM-signed raw MIME from Postique and relays it through SMTP without rebuilding headers.

It is intentionally a **VPS/container** service. Do not deploy it as the only mail path on Vercel/Lambda: serverless platforms commonly block raw SMTP and do not provide a stable egress IP for direct-to-MX.

## Run

```bash
ADAPTER_TOKEN=a-long-random-token \
SMTP_URL='smtp://user:password@relay.example.com:587' \
node adapter/server.mjs
```

Then in Postique:

```env
MAIL_TRANSPORT=http
MAIL_ADAPTER_URL=https://mail-gateway.example.com/v1/deliver
MAIL_ADAPTER_TOKEN=a-long-random-token
MAIL_ADAPTER_TIMEOUT_MS=20000
```

Or configure a route per domain in **Domains → Delivery route**.

The adapter exposes:

- `POST /v1/deliver` — signed delivery request
- `GET /health` — liveness

Request:

```json
{
  "envelope": {
    "from": "support@example.com",
    "to": ["customer@example.com"]
  },
  "raw": "base64-encoded MIME",
  "messageId": "msg_...",
  "metadata": {}
}
```

Headers:

- `Authorization: Bearer <ADAPTER_TOKEN>`
- `X-Postique-Signature: sha256=<HMAC-SHA256 of raw body using ADAPTER_TOKEN>`
- `Idempotency-Key: msg_...`

The response should include:

```json
{
  "status": "sent",
  "id": "provider-message-id",
  "accepted": ["customer@example.com"],
  "rejected": []
}
```

## Safety

- The gateway verifies both the bearer token and HMAC signature.
- It relays the exact MIME bytes Postique signed with DKIM.
- It never logs message bodies.
- The in-memory idempotency cache is only a reference. In production, put the adapter behind your normal load balancer and replace the cache with Redis or your database if you run multiple gateway processes.
- Keep the token in a secret manager, not in source control.
- If the gateway is public, terminate TLS before it or use a private network between Postique and the gateway.
