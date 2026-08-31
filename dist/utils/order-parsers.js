"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseOrder = parseOrder;
exports.parseRefund = parseRefund;
const types_1 = require("../types");
const parsers_1 = require("./parsers");
function parseOrder(data) {
    const record = (0, parsers_1.asRecord)(data) ?? {};
    const amount = parseAmount(record.order_amount);
    const purchaseDetails = (0, parsers_1.asRecord)(record.purchase_details);
    const customer = (0, parsers_1.asRecord)(purchaseDetails?.customer);
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
                billing_address: (0, parsers_1.asRecord)(customer.billing_address),
                shipping_address: (0, parsers_1.asRecord)(customer.shipping_address),
            } : undefined,
            merchant_metadata: (0, parsers_1.asRecord)(purchaseDetails.merchant_metadata),
        } : undefined,
        payments,
        created_at: optionalText(record.created_at),
        updated_at: optionalText(record.updated_at),
        raw: record,
    };
}
function parseRefund(data) {
    const record = (0, parsers_1.asRecord)(data) ?? {};
    return {
        ...parseOrder(record),
        parent_order_id: text(record.parent_order_id),
        raw: record,
    };
}
function parseOrderPayment(value) {
    const record = (0, parsers_1.asRecord)(value) ?? {};
    return {
        id: text(record.id),
        status: text(record.status),
        payment_amount: parseAmount(record.payment_amount),
        payment_method: text(record.payment_method),
        payment_option: (0, parsers_1.asRecord)(record.payment_option),
        acquirer_data: (0, parsers_1.asRecord)(record.acquirer_data),
        created_at: optionalText(record.created_at),
        updated_at: optionalText(record.updated_at),
    };
}
function parseAmount(value) {
    const record = (0, parsers_1.asRecord)(value) ?? {};
    const parsed = Number(record.value ?? 0);
    return new types_1.Amount(Number.isFinite(parsed) ? Math.trunc(parsed) : 0, text(record.currency || "INR"));
}
function text(value) {
    return value === undefined || value === null ? "" : String(value);
}
function optionalText(value) {
    return value === undefined || value === null ? undefined : String(value);
}
