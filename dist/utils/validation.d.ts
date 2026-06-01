import { CreateMandateOptions, PaymentMethod, PluralSellerConfig } from "../types";
export declare function validateConfig(config: PluralSellerConfig): void;
export declare function validateCreateMandateOptions(options: CreateMandateOptions): void;
export declare function isSupportedPaymentMethod(value: unknown): value is PaymentMethod;
export declare function normalizeMobileNumber(value: string): string;
