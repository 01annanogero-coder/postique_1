# postique-verify

Dependency-free Ed25519 verification for Postique email-ownership proofs.

Works in browsers, Node 18+, Cloudflare Workers and Vercel edge functions using Web Crypto.

```js
import { verifyProof } from "postique-verify";

const claims = await verifyProof(token, {
  jwksUrl: "https://mail.example.com/verify/v1/jwks.json",
  audience: "https://app.example.com",
  issuer: "https://mail.example.com",
});

console.log(claims.email); // verified address
```

The helper checks the Ed25519 signature, `exp`, optional `iat`, `aud`, `email_verified` and the optional issuer. It caches the JWKS for five minutes. Use `clearJwksCache()` in tests or after rotation.

## Single-use proofs

`verifyProof()` is sufficient when replay is acceptable. For a form submission or access grant, consume the proof server-side:

```http
POST /verify/v1/proofs/consume
Authorization: Bearer pq_live_...
Content-Type: application/json

{ "proof": "eyJ..." }
```

A second consume returns `409 proof_already_consumed`. The endpoint returns the verified email and verification ID.

The same helper is served by Postique at `/sdk/verify.js`:

```html
<script type="module">
  import { verifyProof } from "https://mail.example.com/sdk/verify.js";
  const claims = await verifyProof(token, {
    jwksUrl: "https://mail.example.com/verify/v1/jwks.json",
    audience: location.origin,
  });
</script>
```
