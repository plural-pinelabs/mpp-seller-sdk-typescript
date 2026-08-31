import { CaptureResult, Mandate, MandateBalanceResult, MandateRevokeResult, PreAuthorization } from "../types";
export declare function parseMandate(data: unknown): Mandate;
export declare function parsePreAuthorization(data: unknown): PreAuthorization;
export declare function dictToCaptureResult(data: Record<string, unknown>): CaptureResult;
export declare function parseMandateBalanceResult(data: unknown): MandateBalanceResult;
export declare function parseMandateRevokeResult(data: unknown): MandateRevokeResult;
export declare function asRecord(value: unknown): Record<string, unknown> | undefined;
export declare function stringOrUndefined(value: unknown): string | undefined;
