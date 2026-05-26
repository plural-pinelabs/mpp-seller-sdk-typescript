import { ChargeOptions, PaymentDecision, PluralSellerConfig } from "../../types";
/** Decide how a seller route should respond to an incoming paid-resource request. */
export declare function decidePayment(options: {
    authorizationHeader?: string;
    grantexTokenHeader?: string;
    config: PluralSellerConfig;
    chargeOptions: ChargeOptions;
}): Promise<PaymentDecision>;
