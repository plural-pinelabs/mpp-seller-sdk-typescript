import type { GrantexAuthorizationOptions, GrantexAuthorizationResult, GrantexBudgetAllocationOptions, GrantexBudgetAllocationResult, GrantexBudgetBalanceResult, GrantexBudgetDebitOptions, GrantexBudgetDebitResult, GrantexBudgetTransactionsOptions, GrantexBudgetTransactionsResult, GrantexExchangeCodeOptions, GrantexExchangeCodeResult, HostedGrantexConfig } from "../types";
export declare const DEFAULT_GRANTEX_BASE_URL = "https://api.grantex.dev";
export declare class HostedGrantexError extends Error {
    readonly status?: number | undefined;
    readonly code?: string | undefined;
    readonly details?: unknown | undefined;
    constructor(message: string, status?: number | undefined, code?: string | undefined, details?: unknown | undefined);
}
export interface HostedGrantexClient {
    createAuthorization(options: GrantexAuthorizationOptions): Promise<GrantexAuthorizationResult>;
    exchangeCode(options: GrantexExchangeCodeOptions): Promise<GrantexExchangeCodeResult>;
    allocateBudget(options: GrantexBudgetAllocationOptions): Promise<GrantexBudgetAllocationResult>;
    debitBudget(options: GrantexBudgetDebitOptions): Promise<GrantexBudgetDebitResult>;
    getBudgetBalance(grantId: string): Promise<GrantexBudgetBalanceResult>;
    listBudgetTransactions(grantId: string, options?: GrantexBudgetTransactionsOptions): Promise<GrantexBudgetTransactionsResult>;
}
export declare function createHostedGrantexClient(config: HostedGrantexConfig): HostedGrantexClient;
export declare function resolveHostedGrantexBaseUrl(config?: Pick<HostedGrantexConfig, "baseUrl">): string;
