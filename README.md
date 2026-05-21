# @plural/mpp-seller-sdk

TypeScript SDK for Plural MPP seller integrations. It generates signed payment
challenges, verifies `Payment` credentials, captures payment through MPP debit,
and builds `Payment-Receipt` headers.

## Install

```bash
npm install @plural/mpp-seller-sdk
```

Requires Node.js `>=18` or another runtime with `fetch`, `AbortSignal.timeout`,
and standard Web APIs.

## Package Layout

The SDK is split into small modules and exposed through npm subpath exports:

```ts
import { PluralMPP } from "@plural/mpp-seller-sdk";
import { PluralMPP as Server } from "@plural/mpp-seller-sdk/server";
import { decidePayment } from "@plural/mpp-seller-sdk/server/middleware";
import { MppEnvironment } from "@plural/mpp-seller-sdk/config";
import type { PluralSellerConfig, PaymentDecision } from "@plural/mpp-seller-sdk/types";
import { buildReceiptHeader } from "@plural/mpp-seller-sdk/utils";
```

Use the root import for most applications. Use subpath imports when building
framework adapters or services with stricter module ownership.

## Quick Start

```ts
import { Amount, ChargeOptions, MppEnvironment, PluralMPP } from "@plural/mpp-seller-sdk";

const mpp = PluralMPP.create({
  clientId: "seller-client-id",
  clientSecret: "seller-client-secret",
  challengeSecretKey: "shared-secret",
  realm: MppEnvironment.SANDBOX,
  baseUrl: MppEnvironment.SANDBOX,
});

const challenge = await mpp.generateChallenge(
  new ChargeOptions(new Amount(50000, "INR"), "/api/premium"),
);
```

## Configuration

```ts
const mpp = PluralMPP.create({
  clientId: process.env.PLURAL_CLIENT_ID!,
  clientSecret: process.env.PLURAL_CLIENT_SECRET!,
  challengeSecretKey: process.env.MPP_CHALLENGE_SECRET!,
  realm: MppEnvironment.SANDBOX,
  baseUrl: MppEnvironment.SANDBOX,
  requestTimeoutMs: 30_000,
  maxRetries: 3,
});
```

`baseUrl` is the Plural MPP base URL. Authentication always uses
`POST /api/auth/v1/token`; the same base URL can route that call internally to
your central Keycloak-backed auth service.

The SDK does not send `Merchant-ID` by default. The bearer token is expected to
be resolved by your infrastructure into merchant context. If a local test setup
needs an explicit merchant header, add it only in that test harness or adapter.

For Grantex grant verification, configure `grantex.jwksUrl` with
`https://grantex.dev/.well-known/jwks.json` or the base URL
`https://grantex.dev`. The seller middleware verifies RS256 signatures offline,
checks expiry and required scopes, and returns `grant_invalid` when enforcement
is enabled and verification fails.

## Generic Middleware Flow

```ts
import { Amount, ChargeOptions, decidePayment } from "@plural/mpp-seller-sdk";

const decision = await decidePayment({
  authorizationHeader: request.headers.get("authorization") ?? undefined,
  grantexTokenHeader: request.headers.get("x-grantex-token") ?? undefined,
  config,
  chargeOptions: new ChargeOptions(new Amount(50000, "INR"), "/api/premium"),
});

if (decision.action !== "proceed") {
  return new Response(JSON.stringify(decision.problemDetails), {
    status: decision.status,
    headers: decision.headers,
  });
}

const response = await handler(request);
response.headers.set("Payment-Receipt", decision.headers["Payment-Receipt"]);
return response;
```

## Flow

1. A request without `Authorization: Payment ...` receives `402` with
   `WWW-Authenticate: Payment <challenge>`.
2. A retried request with a credential is decoded and HMAC verified.
3. The SDK authenticates with `POST /api/auth/v1/token`.
4. The SDK captures payment with `POST /mpp/v1/debit`.
5. The protected handler proceeds and the response receives
   `Payment-Receipt`.

## Development

```bash
npm install
npm run build
npm test
npm pack --dry-run
```

`npm publish --access public` will run `prepublishOnly`, compile `dist/`, and
publish only the files declared in `package.json`.

## License

MIT
