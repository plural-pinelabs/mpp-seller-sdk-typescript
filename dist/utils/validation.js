"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateConfig = validateConfig;
exports.validateCreateMandateOptions = validateCreateMandateOptions;
exports.validateMandateBalanceLookupOptions = validateMandateBalanceLookupOptions;
exports.validateCreateMandateRevokeOptions = validateCreateMandateRevokeOptions;
exports.isSupportedPaymentMethod = isSupportedPaymentMethod;
exports.unsupportedPaymentMethodError = unsupportedPaymentMethodError;
exports.normalizeMobileNumber = normalizeMobileNumber;
const config_1 = require("../config");
const types_1 = require("../types");
function validateConfig(config) {
    const hasClientCredentials = Boolean(config.clientId && config.clientSecret);
    if (!hasClientCredentials) {
        throw new Error("PineLabsOnlineServerConfig: clientId and clientSecret are required");
    }
    if (!(0, config_1.isP3PEnvironment)(config.env)) {
        throw new Error("PineLabsOnlineServerConfig: env must be P3PEnvironment.SANDBOX or P3PEnvironment.PRODUCTION");
    }
    if (config.paymentGateway !== types_1.PaymentGateway.PineLabsOnline) {
        throw new Error("PineLabsOnlineServerConfig: paymentGateway must be PaymentGateway.PineLabsOnline");
    }
    if (!Array.isArray(config.availablePaymentMethods) || config.availablePaymentMethods.length === 0) {
        throw new Error("PineLabsOnlineServerConfig: availablePaymentMethods must contain at least one payment method");
    }
    for (const paymentMethod of config.availablePaymentMethods) {
        if (!isSupportedPaymentMethod(paymentMethod)) {
            throw unsupportedPaymentMethodError("PineLabsOnlineServerConfig: availablePaymentMethods", paymentMethod);
        }
    }
    if (config.grantex?.enforceGrant && !config.grantex.verifier && !config.grantex.hosted?.apiKey?.trim()) {
        throw new Error("PineLabsOnlineServerConfig: grantex.hosted.apiKey is required when grantex.enforceGrant is true");
    }
}
function validateCreateMandateOptions(options) {
    const mobileNumber = String(options.mobileNumber ?? "").trim();
    const normalized = normalizeMobileNumber(mobileNumber);
    if (!mobileNumber) {
        throw new Error("CreateMandateOptions: mobileNumber is required");
    }
    if (!/^\d{10}$/.test(normalized)) {
        throw new Error("CreateMandateOptions: mobileNumber must be 10 digits or E.164 format");
    }
    if (!Number.isInteger(options.amount?.value) || options.amount.value < 100) {
        throw new Error("CreateMandateOptions: amount.value must be at least 100 paise");
    }
    if (options.amount.currency !== "INR") {
        throw new Error("CreateMandateOptions: only INR currency is supported");
    }
    if (options.paymentMethod !== undefined && !isSupportedPaymentMethod(options.paymentMethod)) {
        throw unsupportedPaymentMethodError("CreateMandateOptions: paymentMethod", options.paymentMethod);
    }
}
function validateMandateBalanceLookupOptions(options) {
    const authorizationId = String(options.authorizationId ?? "").trim();
    const phoneNumber = normalizeMobileNumber(String(options.phoneNumber ?? "").trim());
    const paymentMethod = options.paymentMethod;
    if (paymentMethod === undefined || paymentMethod === null) {
        throw new Error("MandateBalanceLookupOptions: paymentMethod is required");
    }
    if (!isSupportedPaymentMethod(paymentMethod)) {
        throw unsupportedPaymentMethodError("MandateBalanceLookupOptions: paymentMethod", paymentMethod);
    }
    if (paymentMethod === types_1.PaymentMethod.OTM) {
        throw new Error("MandateBalanceLookupOptions: OTM is not supported for mandate balance lookup");
    }
    if (!authorizationId && !phoneNumber) {
        throw new Error("MandateBalanceLookupOptions: phoneNumber is required when authorizationId is absent");
    }
    if (!/^\d{10}$/.test(phoneNumber)) {
        throw new Error("MandateBalanceLookupOptions: phoneNumber must be 10 digits");
    }
}
function validateCreateMandateRevokeOptions(options) {
    if (!isSupportedPaymentMethod(options.paymentMethod)) {
        throw unsupportedPaymentMethodError("CreateMandateRevokeOptions: paymentMethod", options.paymentMethod);
    }
    const paymentMethodReferenceId = String(options.paymentMethodReferenceId ?? "").trim();
    const merchantCustomerReference = String(options.customer?.merchantCustomerReference ?? "").trim();
    const mobileNumber = normalizeMobileNumber(String(options.customer?.mobileNumber ?? "").trim());
    if (!paymentMethodReferenceId && !merchantCustomerReference && !mobileNumber) {
        throw new Error("CreateMandateRevokeOptions: paymentMethodReferenceId or customer lookup is required");
    }
    if (mobileNumber && !/^\d{10}$/.test(mobileNumber)) {
        throw new Error("CreateMandateRevokeOptions: customer.mobileNumber must be 10 digits");
    }
}
function isSupportedPaymentMethod(value) {
    return value === types_1.PaymentMethod.RESERVE_PAY
        || value === types_1.PaymentMethod.OTM
        || value === types_1.PaymentMethod.CARD
        || value === types_1.PaymentMethod.CREDIT_EMI;
}
function unsupportedPaymentMethodError(context, value) {
    if (value === types_1.PaymentMethod.Crypto) {
        return new Error(`${context}: PaymentMethod.Crypto is currently not supported in SDKs`);
    }
    return new Error(`${context}: payment method must be RESERVE_PAY, OTM, CARD, or CREDIT_EMI`);
}
function normalizeMobileNumber(value) {
    const digits = String(value ?? "").replace(/\D/g, "");
    if (digits.length > 10) {
        throw new Error(`mobileNumber must be at most 10 digits, got ${digits.length}`);
    }
    return digits;
}
