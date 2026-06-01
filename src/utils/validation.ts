import { isP3PEnvironment } from "../config";
import { CreateMandateOptions, PaymentGateway, PaymentMethod, PineLabsOnlineServerConfig } from "../types";

export function validateConfig(config: PineLabsOnlineServerConfig): void {
  const hasClientCredentials = Boolean(config.clientId && config.clientSecret);
  if (!hasClientCredentials) {
    throw new Error("PineLabsOnlineServerConfig: clientId and clientSecret are required");
  }
  if (!isP3PEnvironment(config.env)) {
    throw new Error("PineLabsOnlineServerConfig: env must be P3PEnvironment.SANDBOX or P3PEnvironment.PRODUCTION");
  }
  if (config.paymentGateway !== PaymentGateway.PineLabsOnline) {
    throw new Error("PineLabsOnlineServerConfig: paymentGateway must be PaymentGateway.PineLabsOnline");
  }
  if (!Array.isArray(config.availablePaymentMethods) || config.availablePaymentMethods.length === 0) {
    throw new Error("PineLabsOnlineServerConfig: availablePaymentMethods must contain at least one payment method");
  }
  for (const paymentMethod of config.availablePaymentMethods) {
    if (!isSupportedPaymentMethod(paymentMethod)) {
      throw new Error(`PineLabsOnlineServerConfig: unsupported payment method "${paymentMethod}"`);
    }
  }
}

export function validateCreateMandateOptions(options: CreateMandateOptions): void {
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

export function isSupportedPaymentMethod(value: unknown): value is PaymentMethod {
  return value === PaymentMethod.UPI_RESERVE_PAY || value === PaymentMethod.Crypto;
}

export function normalizeMobileNumber(value: string): string {
  const digits = String(value ?? "").replace(/\D/g, "");
  return digits.length > 10 ? digits.slice(-10) : digits;
}
