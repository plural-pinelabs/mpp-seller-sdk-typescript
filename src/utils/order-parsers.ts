import { Amount, Order, OrderPayment, Refund } from "../types";
import { asRecord } from "./parsers";

export function parseOrder(data: unknown): Order {
  const record = asRecord(data) ?? {};
  const amount = parseAmount(record.order_amount);
  const purchaseDetails = asRecord(record.purchase_details);
  const customer = asRecord(purchaseDetails?.customer);
  const payments = Array.isArray(record.payments)
    ? record.payments.map(parseOrderPayment)
    : [];

  return {
    order_id: text(record.order_id),
    merchant_order_reference: text(record.merchant_order_reference),
    type: text(record.type),
    status: text(record.status),
    merchant_id: text(record.merchant_id),
    order_amount: amount,
    pre_auth: Boolean(record.pre_auth),
    purchase_details: purchaseDetails ? {
      customer: customer ? {
        email_id: optionalText(customer.email_id),
        first_name: optionalText(customer.first_name),
        last_name: optionalText(customer.last_name),
        customer_id: optionalText(customer.customer_id),
        mobile_number: optionalText(customer.mobile_number),
        billing_address: asRecord(customer.billing_address),
        shipping_address: asRecord(customer.shipping_address),
      } : undefined,
      merchant_metadata: asRecord(purchaseDetails.merchant_metadata),
    } : undefined,
    payments,
    created_at: optionalText(record.created_at),
    updated_at: optionalText(record.updated_at),
    raw: record,
  };
}

export function parseRefund(data: unknown): Refund {
  const record = asRecord(data) ?? {};
  return {
    ...parseOrder(record),
    parent_order_id: text(record.parent_order_id),
    raw: record,
  };
}

function parseOrderPayment(value: unknown): OrderPayment {
  const record = asRecord(value) ?? {};
  return {
    id: text(record.id),
    status: text(record.status),
    payment_amount: parseAmount(record.payment_amount),
    payment_method: text(record.payment_method),
    payment_option: asRecord(record.payment_option),
    acquirer_data: asRecord(record.acquirer_data),
    created_at: optionalText(record.created_at),
    updated_at: optionalText(record.updated_at),
  };
}

function parseAmount(value: unknown): Amount {
  const record = asRecord(value) ?? {};
  const parsed = Number(record.value ?? 0);
  return new Amount(Number.isFinite(parsed) ? Math.trunc(parsed) : 0, text(record.currency || "INR"));
}

function text(value: unknown): string {
  return value === undefined || value === null ? "" : String(value);
}

function optionalText(value: unknown): string | undefined {
  return value === undefined || value === null ? undefined : String(value);
}
