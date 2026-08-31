import { CreateMandateOptions, CreateMandateRevokeOptions, MandateBalanceLookupOptions, PaymentMethod, PineLabsOnlineServerConfig } from "../types";
export declare function validateConfig(config: PineLabsOnlineServerConfig): void;
export declare function validateCreateMandateOptions(options: CreateMandateOptions): void;
export declare function validateMandateBalanceLookupOptions(options: MandateBalanceLookupOptions): void;
export declare function validateCreateMandateRevokeOptions(options: CreateMandateRevokeOptions): void;
export declare function isSupportedPaymentMethod(value: unknown): value is PaymentMethod;
export declare function unsupportedPaymentMethodError(context: string, value: unknown): Error;
export declare function normalizeMobileNumber(value: string): string;
