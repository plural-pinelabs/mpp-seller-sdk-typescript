import { CreateMandateOptions, PaymentMethod, PineLabsOnlineServerConfig } from "../types";
export declare function validateConfig(config: PineLabsOnlineServerConfig): void;
export declare function validateCreateMandateOptions(options: CreateMandateOptions): void;
export declare function isSupportedPaymentMethod(value: unknown): value is PaymentMethod;
export declare function normalizeMobileNumber(value: string): string;
