"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.dictToCaptureResult = dictToCaptureResult;
exports.asRecord = asRecord;
exports.stringOrUndefined = stringOrUndefined;
const types_1 = require("../types");
function dictToCaptureResult(data) {
    const amountRecord = asRecord(data.amount);
    const metadata = asRecord(data.metadata) ?? {};
    const sbmdData = asRecord(metadata.sbmd_data) ?? {};
    const amountValue = amountRecord?.value ?? data.amount ?? 0;
    const currency = amountRecord?.currency ?? data.currency ?? "INR";
    const captureId = metadata.external_capture_id ?? data.capture_id ?? data.debit_id ?? data.payment_id ?? "";
    return {
        capture_id: String(captureId),
        object: String(data.object ?? "debit"),
        mandate_id: String(data.authorization_id ?? data.mandate_id ?? data.pre_authorization_id ?? ""),
        token_id: String(data.token_id ?? data.payment_token ?? ""),
        customer_id: String(data.customer_id ?? data.customer_reference ?? ""),
        merchant_id: String(data.merchant_id ?? ""),
        order_id: String(data.oms_order_id ?? data.order_id ?? data.merchant_order_reference ?? ""),
        order_status: String(data.order_status ?? data.status ?? ""),
        payment_id: String(data.payment_id ?? data.oms_payment_id ?? data.debit_id ?? ""),
        payment_status: String(metadata.upstream_payment_status ?? data.payment_status ?? data.status ?? ""),
        amount: new types_1.Amount(Number(amountValue), String(currency)),
        upi_txn_id: String(sbmdData.upi_txn_id ?? data.upi_txn_id ?? ""),
        receipt: asRecord(data.receipt) ?? {
            reference: data.payment_id ?? "",
            oms_payment_id: data.oms_payment_id ?? "",
            external_payment_id: metadata.external_payment_id ?? "",
        },
        description: stringOrUndefined(data.description),
        merchant_order_reference: stringOrUndefined(data.merchant_order_reference),
        metadata,
        settled_at: String(sbmdData.settled_at ?? data.settled_at ?? ""),
        created_at: String(data.created_at ?? ""),
        raw: data,
    };
}
function asRecord(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value)
        ? value
        : undefined;
}
function stringOrUndefined(value) {
    return value === undefined || value === null ? undefined : String(value);
}
