"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HostedGrantexError = exports.DEFAULT_GRANTEX_BASE_URL = void 0;
exports.createHostedGrantexClient = createHostedGrantexClient;
exports.resolveHostedGrantexBaseUrl = resolveHostedGrantexBaseUrl;
exports.DEFAULT_GRANTEX_BASE_URL = "https://api.grantex.dev";
class HostedGrantexError extends Error {
    status;
    code;
    details;
    constructor(message, status, code, details) {
        super(message);
        this.status = status;
        this.code = code;
        this.details = details;
        this.name = "HostedGrantexError";
    }
}
exports.HostedGrantexError = HostedGrantexError;
function createHostedGrantexClient(config) {
    if (!config.apiKey?.trim()) {
        throw new Error("HostedGrantexConfig: apiKey is required");
    }
    let clientPromise;
    const getClient = async () => {
        if (!clientPromise) {
            clientPromise = Promise.resolve(config.sdkFactory ? config.sdkFactory() : loadHostedGrantexSdk(config))
                .then((client) => client);
        }
        return clientPromise;
    };
    return {
        async createAuthorization(options) {
            const client = await getClient();
            const authorize = requiredFunction(client, "authorize");
            const raw = await callHosted(() => authorize.call(client, {
                agentId: options.agentId,
                userId: options.userId,
                scopes: options.scopes,
                redirectUri: options.redirectUri,
                expiresIn: options.expiresIn,
                codeChallenge: options.codeChallenge,
                codeChallengeMethod: options.codeChallengeMethod,
            }));
            return normalizeAuthorization(raw);
        },
        async exchangeCode(options) {
            const client = await getClient();
            const tokens = requiredObject(client, "tokens");
            const exchange = requiredFunction(tokens, "exchange");
            const raw = await callHosted(() => exchange.call(tokens, {
                code: options.code,
                agentId: options.agentId,
                codeVerifier: options.codeVerifier,
                credentialFormat: options.credentialFormat,
            }));
            return normalizeToken(raw);
        },
        async allocateBudget(options) {
            const budgets = requiredObject(await getClient(), "budgets");
            const allocate = requiredFunction(budgets, "allocate");
            const raw = await callHosted(() => allocate.call(budgets, {
                grantId: options.grantId,
                initialBudget: options.initialBudget,
                currency: options.currency ?? "INR",
            }));
            return normalizeBudget(raw, options.grantId);
        },
        async debitBudget(options) {
            const budgets = requiredObject(await getClient(), "budgets");
            const debit = requiredFunction(budgets, "debit");
            const raw = await callHosted(() => debit.call(budgets, {
                grantId: options.grantId,
                amount: options.amount,
                description: options.description,
                metadata: options.metadata,
            }));
            return normalizeDebit(raw, options.grantId);
        },
        async getBudgetBalance(grantId) {
            const budgets = requiredObject(await getClient(), "budgets");
            const balance = requiredFunction(budgets, "balance");
            const raw = await callHosted(() => balance.call(budgets, grantId));
            return normalizeBudget(raw, grantId);
        },
        async listBudgetTransactions(grantId, options = {}) {
            const budgets = requiredObject(await getClient(), "budgets");
            const transactions = requiredFunction(budgets, "transactions");
            const raw = await callHosted(() => transactions.call(budgets, grantId, options));
            return normalizeTransactions(raw, grantId);
        },
    };
}
function resolveHostedGrantexBaseUrl(config) {
    const url = normalizeBaseUrl(config?.baseUrl ?? exports.DEFAULT_GRANTEX_BASE_URL);
    if (!isHttpsUrl(url)) {
        throw new Error(`HostedGrantexConfig: baseUrl must use HTTPS (got: ${url})`);
    }
    return url;
}
function isHttpsUrl(url) {
    return url.startsWith("https://") || isLocalhostUrl(url);
}
function isLocalhostUrl(url) {
    try {
        const { hostname } = new URL(url);
        return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" || hostname === "host.docker.internal" || !hostname.includes(".");
    }
    catch {
        return false;
    }
}
async function loadHostedGrantexSdk(config) {
    // Resolve @grantex/sdk relative to THIS file so the import finds it in the
    // server SDK's own node_modules regardless of the consumer's working directory.
    // require.resolve() is CJS-relative (not CWD-relative); pathToFileURL makes it
    // safe for the bundler-bypass dynamic import.
    let specifier = "@grantex/sdk";
    try {
        const { pathToFileURL } = require("url");
        specifier = pathToFileURL(require.resolve("@grantex/sdk")).href;
    }
    catch {
        // Fall back to bare specifier if resolution fails
    }
    const dynamicImport = Function("s", "return import(s)");
    const sdk = await dynamicImport(specifier);
    const Constructor = sdk.Grantex ?? sdk.default;
    if (!Constructor) {
        throw new Error("@grantex/sdk: Grantex export is required");
    }
    return new Constructor({
        apiKey: config.apiKey,
        baseUrl: resolveHostedGrantexBaseUrl(config),
        timeout: config.timeoutMs,
        maxRetries: config.maxRetries,
    });
}
function normalizeAuthorization(raw) {
    const record = asRecord(raw);
    return {
        authRequestId: stringValue(record, "authRequestId", "auth_request_id", "id"),
        consentUrl: stringValue(record, "consentUrl", "consent_url", "redirectUrl", "redirect_url", "url"),
        agentId: stringValue(record, "agentId", "agent_id"),
        principalId: stringValue(record, "principalId", "principal_id", "userId", "user_id"),
        scopes: arrayValue(record, "scopes"),
        expiresAt: optionalStringValue(record, "expiresAt", "expires_at"),
        status: optionalStringValue(record, "status"),
        raw: record,
    };
}
function normalizeToken(raw) {
    const record = asRecord(raw);
    return {
        grantToken: stringValue(record, "grantToken", "grant_token", "accessToken", "access_token", "token"),
        grantId: stringValue(record, "grantId", "grant_id", "id"),
        refreshToken: optionalStringValue(record, "refreshToken", "refresh_token"),
        scopes: arrayValue(record, "scopes"),
        expiresAt: optionalStringValue(record, "expiresAt", "expires_at"),
        raw: record,
    };
}
function normalizeBudget(raw, grantId) {
    const record = asRecord(raw);
    return {
        id: stringValue(record, "id", "budgetId", "budget_id"),
        grantId: stringValue(record, "grantId", "grant_id") || grantId,
        initialBudget: numberValue(record, "initialBudget", "initial_budget"),
        remainingBudget: numberValue(record, "remainingBudget", "remaining_budget"),
        currency: stringValue(record, "currency") || "INR",
        createdAt: optionalStringValue(record, "createdAt", "created_at"),
        raw: record,
    };
}
function normalizeDebit(raw, grantId) {
    const record = asRecord(raw);
    return {
        grantId: stringValue(record, "grantId", "grant_id") || grantId,
        remaining: numberValue(record, "remaining", "remainingBudget", "remaining_budget"),
        transactionId: optionalStringValue(record, "transactionId", "transaction_id", "id"),
        raw: record,
    };
}
function normalizeTransactions(raw, grantId) {
    const record = asRecord(raw);
    const values = Array.isArray(record.transactions) ? record.transactions : [];
    return {
        total: optionalNumberValue(record, "total"),
        transactions: values.map((value) => {
            const item = asRecord(value);
            return {
                id: stringValue(item, "id", "transactionId", "transaction_id"),
                grantId: stringValue(item, "grantId", "grant_id") || grantId,
                amount: numberValue(item, "amount"),
                description: optionalStringValue(item, "description"),
                balanceAfter: optionalNumberValue(item, "balanceAfter", "balance_after"),
                createdAt: optionalStringValue(item, "createdAt", "created_at"),
                raw: item,
            };
        }),
        raw: record,
    };
}
async function callHosted(operation) {
    try {
        return await operation();
    }
    catch (error) {
        throw normalizeHostedError(error);
    }
}
function normalizeHostedError(error) {
    if (error instanceof HostedGrantexError) {
        return error;
    }
    const record = asRecord(error);
    const response = asRecord(record.response);
    const data = asRecord(record.data) ?? asRecord(response.body) ?? asRecord(response.data);
    const status = numberFromUnknown(record.status ?? record.httpStatus ?? response.status);
    const code = optionalString(record.code ?? data.code ?? data.error);
    const message = optionalString(record.message ?? data.message) ?? "Hosted Grantex request failed";
    return new HostedGrantexError(message, status, code, error);
}
function requiredObject(record, key) {
    const value = record[key];
    if (!value || typeof value !== "object") {
        throw new Error(`@grantex/sdk: ${key} client is required`);
    }
    return value;
}
function requiredFunction(record, key) {
    const value = record[key];
    if (typeof value !== "function") {
        throw new Error(`@grantex/sdk: ${key} function is required`);
    }
    return value;
}
function asRecord(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value)
        ? value
        : {};
}
function stringValue(record, ...keys) {
    return optionalStringValue(record, ...keys) ?? "";
}
function optionalStringValue(record, ...keys) {
    for (const key of keys) {
        const value = record[key];
        const normalized = optionalString(value);
        if (normalized !== undefined) {
            return normalized;
        }
    }
    return undefined;
}
function optionalString(value) {
    if (value === undefined || value === null || value === "") {
        return undefined;
    }
    return String(value);
}
function arrayValue(record, key) {
    const value = record[key];
    return Array.isArray(value) ? value.map(String) : [];
}
function numberValue(record, ...keys) {
    return optionalNumberValue(record, ...keys) ?? 0;
}
function optionalNumberValue(record, ...keys) {
    for (const key of keys) {
        const value = numberFromUnknown(record[key]);
        if (value !== undefined) {
            return value;
        }
    }
    return undefined;
}
function numberFromUnknown(value) {
    if (typeof value === "number" && Number.isFinite(value)) {
        return value;
    }
    if (typeof value === "string" && value.trim()) {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : undefined;
    }
    return undefined;
}
function normalizeBaseUrl(value) {
    return value.replace(/\/+$/, "");
}
