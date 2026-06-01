"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateConfig = validateConfig;
exports.validateCreateMandateOptions = validateCreateMandateOptions;
exports.isSupportedPaymentMethod = isSupportedPaymentMethod;
exports.normalizeMobileNumber = normalizeMobileNumber;
const config_1 = require("../config");
const types_1 = require("../types");
function validateConfig(config) {
    const hasClientCredentials = Boolean(config.clientId && config.clientSecret);
    if (!hasClientCredentials) {
        throw new Error("PluralSellerConfig: clientId and clientSecret are required");
    }
    // Derive challengeSecretKey from clientSecret if not explicitly provided
    if (!config.challengeSecretKey) {
        config.challengeSecretKey = config.clientSecret;
    }
    if (!(0, config_1.isP3PEnvironment)(config.env)) {
        throw new Error("PluralSellerConfig: env must be P3PEnvironment.SANDBOX or P3PEnvironment.PRODUCTION");
    }
    if (config.paymentGateway !== types_1.PaymentGateway.PineLabsOnline) {
        throw new Error("PluralSellerConfig: paymentGateway must be PaymentGateway.PineLabsOnline");
    }
    if (!Array.isArray(config.availablePaymentMethods) || config.availablePaymentMethods.length === 0) {
        throw new Error("PluralSellerConfig: availablePaymentMethods must contain at least one payment method");
    }
    for (const paymentMethod of config.availablePaymentMethods) {
        if (!isSupportedPaymentMethod(paymentMethod)) {
            throw new Error(`PluralSellerConfig: unsupported payment method "${paymentMethod}"`);
        }
    }
}
function validateCreateMandateOptions(options) {
    const customerReference = String(options.customerReference ?? options.customerId ?? "").trim();
    const mobileNumber = String(options.mobileNumber ?? "").trim();
    const normalized = normalizeMobileNumber(mobileNumber);
    if (!customerReference && !mobileNumber) {
        throw new Error("CreateMandateOptions: customerReference or mobileNumber is required");
    }
    if (mobileNumber && !/^\d{10}$/.test(normalized)) {
        throw new Error("CreateMandateOptions: mobileNumber must be 10 digits or E.164 format");
    }
    if (!Number.isInteger(options.amount?.value) || options.amount.value < 100) {
        throw new Error("CreateMandateOptions: amount.value must be at least 100 paise");
    }
    if (options.amount.currency !== "INR") {
        throw new Error("CreateMandateOptions: only INR currency is supported");
    }
}
function isSupportedPaymentMethod(value) {
    return value === types_1.PaymentMethod.UpiSbmd || value === types_1.PaymentMethod.Crypto;
}
function normalizeMobileNumber(value) {
    const digits = String(value ?? "").replace(/\D/g, "");
    return digits.length > 10 ? digits.slice(-10) : digits;
}
