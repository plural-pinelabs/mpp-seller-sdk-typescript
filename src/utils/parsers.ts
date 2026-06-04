import { Amount, CaptureResult, Mandate } from "../types";

export function parseMandate(data: unknown): Mandate {
  const record = asRecord(data) ?? {};
  const metadata = asRecord(record.metadata) ?? {};
  const sbmdData = asRecord(metadata.sbmd_data) ?? asRecord(metadata.sbmdData) ?? {};
  const amount = asRecord(record.payment_amount) ?? asRecord(record.paymentAmount) ?? asRecord(record.amount);
  const customer = asRecord(record.customer);
  const amountValue = amount?.value ?? record.amount_value ?? metadata.amount ?? 0;
  const amountCurrency = amount?.currency ?? record.amount_currency ?? metadata.currency ?? "INR";
  const challengeUrl = record.challenge_url ?? record.challengeUrl;
  const challenge = asRecord(record.challenge);
  return {
    mandate_id: String(record.payment_method_reference_id ?? record.authorization_id ?? record.authorizationId ?? record.mandate_id ?? record.mandateId ?? metadata.external_subscription_id ?? ""),
    object: String(record.object ?? "mandate"),
    order_id: String(record.order_id ?? sbmdData.order_id ?? ""),
    order_status: String(record.order_status ?? record.payment_status ?? record.status ?? ""),
    payment_status: String(record.payment_status ?? record.order_status ?? record.status ?? ""),
    customer_reference: String(customer?.merchant_customer_reference ?? record.merchant_customer_reference ?? record.customer_reference ?? record.customer_id ?? ""),
    customer_id: String(customer?.customer_id ?? record.customer_id ?? record.customer_reference ?? ""),
    agent_id: String(record.agent_id ?? ""),
    amount: new Amount(amountToInt(amountValue), String(amountCurrency)),
    amount_blocked: Number(record.amount_blocked ?? sbmdData.amount_blocked ?? 0),
    amount_debited: Number(record.amount_debited ?? sbmdData.amount_debited ?? 0),
    amount_held: Number(record.amount_held ?? sbmdData.amount_held ?? 0),
    amount_available: Number(record.amount_available ?? sbmdData.amount_available ?? 0),
    mobile_number: String(customer?.mobile_number ?? record.mobile_number ?? ""),
    description: stringOrUndefined(record.description ?? metadata.description),
    metadata,
    expires_at: String(record.expiry_at ?? record.expires_at ?? sbmdData.expires_at ?? ""),
    created_at: String(record.created_at ?? sbmdData.created_at ?? ""),
    challenge: challenge || challengeUrl ? {
      type: String(challenge?.type ?? sbmdData.challenge_type ?? ""),
      qr_url: String(challenge?.qr_url ?? challengeUrl ?? ""),
      deep_link: String(challenge?.deep_link ?? challengeUrl ?? ""),
      expires_at: String(challenge?.expires_at ?? record.expiry_at ?? sbmdData.expires_at ?? ""),
    } : undefined,
    raw: record,
  };
}

export function dictToCaptureResult(data: Record<string, unknown>): CaptureResult {
  const amountRecord = asRecord(data.amount) ?? asRecord(data.payment_amount) ?? asRecord(data.paymentAmount);
  const customer = asRecord(data.customer);
  const paymentData = asRecord(data.payment_data) ?? asRecord(data.paymentData) ?? {};
  const paymentSbmdData = asRecord(paymentData.sbmd_data) ?? asRecord(paymentData.sbmdData) ?? {};
  const metadata: Record<string, unknown> = {
    ...(asRecord(data.metadata) ?? {}),
    ...(Object.keys(paymentData).length > 0 ? { payment_data: paymentData } : {}),
  };
  const sbmdData = asRecord(metadata.sbmd_data) ?? paymentSbmdData;
  const amountValue = amountRecord?.value ?? data.amount ?? data.payment_amount ?? 0;
  const currency = amountRecord?.currency ?? data.currency ?? "INR";
  const captureId = data.merchant_payment_debit_reference ?? metadata.external_capture_id ?? data.capture_id ?? data.debit_id ?? data.payment_id ?? "";
  const externalPaymentId = paymentSbmdData.upstream_payment_id ?? metadata.external_payment_id ?? data.payment_id ?? data.oms_payment_id ?? "";
  return {
    capture_id: String(captureId),
    object: String(data.object ?? "debit"),
    mandate_id: String(data.payment_method_reference_id ?? data.authorization_id ?? data.mandate_id ?? data.pre_authorization_id ?? ""),
    token_id: String(data.token_id ?? data.payment_token ?? ""),
    customer_id: String(customer?.customer_id ?? data.customer_id ?? customer?.merchant_customer_reference ?? data.customer_reference ?? ""),
    merchant_id: String(data.merchant_id ?? ""),
    order_id: String(paymentData.order_id ?? data.oms_order_id ?? data.order_id ?? data.merchant_order_reference ?? ""),
    order_status: String(paymentData.order_status ?? data.order_status ?? data.status ?? ""),
    payment_id: String(externalPaymentId || data.debit_id || ""),
    payment_status: String(paymentSbmdData.upstream_payment_status ?? metadata.upstream_payment_status ?? paymentData.payment_status ?? paymentData.order_status ?? data.payment_status ?? data.status ?? ""),
    amount: new Amount(Number(amountValue), String(currency)),
    upi_txn_id: String(sbmdData.upi_txn_id ?? data.upi_txn_id ?? ""),
    receipt: asRecord(data.receipt) ?? {
      reference: captureId,
      oms_payment_id: data.oms_payment_id ?? "",
      external_payment_id: externalPaymentId,
    },
    description: stringOrUndefined(data.description),
    merchant_order_reference: stringOrUndefined(data.merchant_order_reference ?? data.merchant_payment_debit_reference),
    merchant_payment_debit_reference: stringOrUndefined(data.merchant_payment_debit_reference),
    payment_data: Object.keys(paymentData).length > 0 ? paymentData : undefined,
    status: stringOrUndefined(data.status),
    metadata,
    settled_at: String(sbmdData.settled_at ?? data.settled_at ?? ""),
    created_at: String(data.created_at ?? ""),
    raw: data,
  };
}

export function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

export function stringOrUndefined(value: unknown): string | undefined {
  return value === undefined || value === null ? undefined : String(value);
}

function amountToInt(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : 0;
}
