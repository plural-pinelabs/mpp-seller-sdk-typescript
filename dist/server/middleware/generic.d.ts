import { ChargeOptions, PaymentDecision, PineLabsOnlineServerConfig } from "../../types";
/** Decide how a server route should respond to an incoming paid-resource request. */
export declare function decidePayment(options: {
    credentialHeader?: string;
    grantexTokenHeader?: string;
    config: PineLabsOnlineServerConfig;
    chargeOptions: ChargeOptions;
}): Promise<PaymentDecision>;
