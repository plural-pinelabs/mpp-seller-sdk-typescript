import { CaptureResult, Mandate } from "../types";
export declare function parseMandate(data: unknown): Mandate;
export declare function dictToCaptureResult(data: Record<string, unknown>): CaptureResult;
export declare function asRecord(value: unknown): Record<string, unknown> | undefined;
export declare function stringOrUndefined(value: unknown): string | undefined;
