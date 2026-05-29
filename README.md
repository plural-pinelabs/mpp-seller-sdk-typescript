# Plural P3P Seller SDK

TypeScript SDK for Plural P3P seller integrations. It generates
signed HTTP `402` payment challenges, verifies buyer `Payment` credentials,
captures payment through P3P debit, and builds `Payment-Receipt` headers.

## Install

```bash
npm install @pine-labs-online/p3p-seller-sdk
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
  PluralP3P,
} from "@pine-labs-online/p3p-seller-sdk";

const p3p = PluralP3P.create({
  clientId: "seller-client-id",
  clientSecret: "seller-client-secret",
  challengeSecretKey: "shared-secret",
  paymentGateway: PaymentGateway.PineLabsOnline,
  availablePaymentMethods: [PaymentMethod.UpiSbmd, PaymentMethod.Crypto],
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
controls what the seller advertises inside each 402 challenge:

```ts
const config = {
  clientId: "...",
  clientSecret: "...",
  challengeSecretKey: "...",
  paymentGateway: PaymentGateway.PineLabsOnline,
  availablePaymentMethods: [PaymentMethod.UpiSbmd, PaymentMethod.Crypto],
  env: P3PEnvironment.SANDBOX,
};
```

`clientId`, `clientSecret`, `challengeSecretKey`, and `env` are mandatory.
The SDK exchanges client credentials internally and refreshes its cached bearer
token before expiry. Static `accessToken` and `baseUrl` config fields are no
longer supported.

Environment defaults:

| Env | URL | Timeout | Retries | Initial retry delay |
|---|---|---:|---:|---:|
| `P3PEnvironment.SANDBOX` | `https://pluraluat.v2.pinepg.in` | 30000 ms | 2 | 300 ms |
| `P3PEnvironment.PRODUCTION` | `https://api.pluralpay.in` | 10000 ms | 2 | 200 ms |

The generated challenge includes:

- `paymentGateway: "PINE LABS ONLINE"`
- `request.availablePaymentMethods: ["SBMD", "CRYPTO"]`

During verification, the seller SDK rejects buyer credentials whose
`payload.payment_gateway` does not match the challenge gateway or whose
`payload.payment_method` is not advertised by the signed challenge and seller
config.

## Generic Middleware Flow

```ts
import {
  Amount,
  ChargeOptions,
  decidePayment,
} from "@pine-labs-online/p3p-seller-sdk";

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

The debit request body uses the current P3P contract:

- `type` is the selected payment method, for example `"SBMD"`.
- `customer.merchant_customer_reference` is populated from the buyer
  credential.
- `payment_amount.value` is numeric minor units.
- `payment_token` is the one-shot token from the buyer credential.
- `challenge_id` is the seller challenge id from the verified buyer credential.
- `Idempotency-Key` is sent as a header; `Merchant-ID` is not sent by the SDK.

Receipt payloads include `paymentGateway` and `paymentMethod` when that context
is available. The older receipt `method` field is not emitted.

## Mandates And Tokens

Seller-side mandate creation is available through `POST /mpp/v1/pre-authorize`:

```ts
const mandate = await p3p.createMandate({
  customerReference: "customer-ref-123",
  amount: new Amount(50000, "INR"),
  validityInDays: 20,
  paymentMethod: PaymentMethod.UpiSbmd,
});
```

The seller SDK intentionally does not expose token creation. The buyer/customer
flow obtains a one-shot token and sends it back in the `P3P-Credential: Payment`
credential. The seller SDK verifies that credential and then calls
`POST /mpp/v1/debit`.

## Development

```bash
npm install
npm run build
npm test
```

## License

MIT
