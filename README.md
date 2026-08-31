# Pine Labs Online P3P Server SDK

TypeScript SDK for Pine Labs Online P3P server integrations. It generates
signed HTTP `402` payment challenges, verifies client `Payment` credentials,
captures payment through P3P debit, and builds `Payment-Receipt` headers.

## Install

```bash
npm install p3p-server-sdk
```

Requires Node.js `>=18` or another runtime with `fetch`, `AbortSignal.timeout`,
and standard Web APIs.

## Quick Start

```ts
import {
  Amount,
  ChargeOptions,
  P3PEnvironment,
  PaymentGateway,
  PaymentMethod,
  PineLabsOnlineP3P,
} from "p3p-server-sdk";

const p3p = PineLabsOnlineP3P.create({
  clientId: "server-client-id",
  clientSecret: "server-client-secret",
  paymentGateway: PaymentGateway.PineLabsOnline,
  availablePaymentMethods: [PaymentMethod.RESERVE_PAY, PaymentMethod.OTM, PaymentMethod.CARD, PaymentMethod.CREDIT_EMI],
  realm: P3PEnvironment.SANDBOX,
  env: P3PEnvironment.SANDBOX,
});

const challenge = await p3p.generateChallenge(
  new ChargeOptions(new Amount(50000, "INR"), "/api/premium"),
);
```

## Payment Configuration

`paymentGateway` is mandatory and currently supports
`PaymentGateway.PineLabsOnline`. `availablePaymentMethods` is mandatory and
controls what the server advertises inside each 402 challenge:

```ts
const config = {
  clientId: "...",
  clientSecret: "...",
  paymentGateway: PaymentGateway.PineLabsOnline,
  availablePaymentMethods: [PaymentMethod.RESERVE_PAY, PaymentMethod.OTM, PaymentMethod.CARD, PaymentMethod.CREDIT_EMI],
  env: P3PEnvironment.SANDBOX,
};
```

`clientId`, `clientSecret`, and `env` are mandatory.
The SDK exchanges client credentials internally and refreshes its cached bearer
token before expiry. Static `accessToken` and `baseUrl` config fields are no
longer supported.
The local challenge HMAC key is derived internally from `clientSecret` with a
stable SDK prefix, so there is no separate challenge-signing config field.

Environment defaults:

| Env | URL | Timeout | Retries | Initial retry delay |
|---|---|---:|---:|---:|
| `P3PEnvironment.SANDBOX` | `https://pluraluat.v2.pinepg.in` | 60000 ms | 2 | 300 ms |
| `P3PEnvironment.PRODUCTION` | `https://api.pluralpay.in` | 45000 ms | 2 | 200 ms |

The generated challenge includes:

- `request.availablePaymentMethods: ["RESERVE_PAY", "OTM", "CARD", "CREDIT_EMI"]`

For offer-led Credit EMI, pass `PaymentMethod.CREDIT_EMI` to
`createPreAuthorization`. The SDK preserves it as
`payment_method: "CREDIT_EMI"` and serializes structured merchant metadata:

```ts
await p3p.createPreAuthorization({
  paymentMethod: PaymentMethod.CREDIT_EMI,
  mobileNumber,
  amount: new Amount(orderAmountPaise, "INR"),
  validityInDays: 7,
  merchantMetadata: {
    offer_data: selectedOfferData,
    p3p_offer_required: "true",
  },
});
```

During verification, the server SDK rejects client credentials whose
`payload.payment_method` is not advertised by the signed challenge and server
config. `paymentGateway` is not emitted in the server challenge payload.

## Generic Middleware Flow

```ts
import {
  Amount,
  ChargeOptions,
  decidePayment,
} from "p3p-server-sdk";

const decision = await decidePayment({
  credentialHeader: request.headers.get("P3P-Credential") ?? undefined,
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

## 402 Flow

1. A request without `P3P-Credential: Payment ...` receives `402` with
   `WWW-Authenticate: Payment <challenge>`.
2. A retried request with a credential is decoded and HMAC verified.
3. The SDK authenticates with `POST /api/auth/v1/token`.
4. The SDK captures payment with `POST /mpp/v1/debit`.
5. The protected handler proceeds and the response receives
   `Payment-Receipt`.

If `/mpp/v1/debit` returns `202 Accepted`, the SDK treats that as an
accepted-but-processing debit. It does **not** re-POST `/mpp/v1/debit` — Pine
Labs rejects a resubmit with the same `Idempotency-Key` (`422`). Instead the
SDK resolves the terminal status by polling the read-only endpoint
`GET /mpp/v1/debit/{id}`:

- polls up to `maxRetries` times until the debit reaches a terminal status
- respects `Retry-After` from the `202` response when Pine Labs returns it
- falls back to `initialRetryDelayMs` otherwise
- genuine transient failures on the initial POST (network errors, `HTTP 429`,
  and `5xx`) are still retried by the SDK's request layer

If the poll budget is exhausted and the debit is still non-terminal, the
middleware returns `202` with `idempotencyKey` on the result and the protected
resource must stay withheld. Application code can later call
`p3p.getDebitStatus(idempotencyKey)` to reconcile.

The debit request body uses the current P3P contract:

- `type` is the selected payment method, for example `"RESERVE_PAY"`.
- `customer.merchant_customer_reference` is populated from the client
  credential.
- `payment_amount.value` is numeric minor units.
- `payment_token` is the one-shot token from the client credential.
- `challenge_id` is the server challenge id from the verified client credential.
- `Idempotency-Key` is sent as a header; `Merchant-ID` is not sent by the SDK.

Receipt payloads include `paymentGateway` and `paymentMethod` when that context
is available. The older receipt `method` field is not emitted.

## Mandates And Tokens

Server-side mandate creation is available through `POST /mpp/v1/pre-authorize`:

```ts
const mandate = await p3p.createMandate({
  customerReference: "customer-ref-123",
  amount: new Amount(50000, "INR"),
  validityInDays: 20,
  paymentMethod: PaymentMethod.RESERVE_PAY,
});
```

Card pre-authorization uses the same endpoint and returns the service contract
shape directly:

```ts
const preAuthorization = await p3p.createPreAuthorization({
  paymentMethod: PaymentMethod.CARD,
  mobileNumber: "9876543210",
  amount: new Amount(1000, "INR"),
  validityInDays: 7,
  description: "Card pre-auth for order-123",
});

console.log(preAuthorization.payment_method_reference_id);
// `challenge_url` / `redirect_url` points at the hosted checkout where the
// customer completes 3DS / card authorization. Open it in an iframe or
// redirect the customer to it, then wait for the mandate to become ACTIVE
// before capturing.
console.log(preAuthorization.redirect_url ?? preAuthorization.challenge_url);
```

### End-to-End Card Payment

The full CARD flow uses `payment_method_reference_id` returned by
`createPreAuthorization` to link the eventual debit back to the customer's
authorized card:

```ts
// 1. Create a card pre-authorization (customer completes the hosted checkout).
const preAuth = await p3p.createPreAuthorization({
  paymentMethod: PaymentMethod.CARD,
  mobileNumber: "9876543210",
  amount: new Amount(50000, "INR"),
  validityInDays: 7,
});

// 2. Direct the customer to the checkout URL (iframe or redirect).
//    On success the pre-authorization transitions to ACTIVE.
const checkoutUrl = preAuth.redirect_url ?? preAuth.challenge_url;

// 3. Poll the mandate until it becomes ACTIVE.
let mandate = await p3p.getMandate(preAuth.payment_method_reference_id);
while (mandate.payment_status !== "ACTIVE") {
  await new Promise((resolve) => setTimeout(resolve, 2000));
  mandate = await p3p.getMandate(preAuth.payment_method_reference_id);
}

// 4. Charge the card via the standard 402 flow. The Server SDK issues a
//    Payment challenge and, once the Client SDK returns a Payment credential
//    that carries a token bound to this pre-auth, calls POST /mpp/v1/debit
//    with `payment_method_reference_id: preAuth.payment_method_reference_id`.
```

On the client side, the Client SDK creates the payment token with
`paymentMethod: PaymentMethod.CARD` — see the Client SDK README for the
matching runtime context.

The server SDK intentionally does not expose token creation. The client/customer
flow obtains a one-shot token and sends it back in the `P3P-Credential: Payment`
credential. The server SDK verifies that credential and then calls
`POST /mpp/v1/debit`.

The server SDK also exposes debit status lookup by idempotency key:

```ts
const latestDebit = await p3p.getDebitStatus("idem_key_123");
```

This calls `GET /mpp/v1/debit/{id}` and returns the same debit payload family
as the original debit call, so application code can reconcile a pending payment
later without re-running the full paid request flow.

## Development

```bash
npm install
npm run build
npm test
```

## License

MIT
