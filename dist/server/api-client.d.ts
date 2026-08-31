import { CreateRefundOptions, CreateMandateRevokeOptions, CreateMandateOptions, CreatePreAuthorizationOptions, Mandate, MandateBalanceLookupOptions, MandateBalanceResult, MandateRevokeResult, Order, PineLabsOnlineServerConfig, PreAuthorization, Refund } from "../types";
export declare class ApiClient {
    private config;
    private readonly baseUrl;
    private readonly fetchImpl;
    private readonly auth;
    constructor(config: PineLabsOnlineServerConfig);
    /** Create an P3P mandate/pre-authorization and normalize the service response. */
    createMandate(options: CreateMandateOptions): Promise<Mandate>;
    /** Create a card/mandate pre-authorization and return the service contract shape. */
    createPreAuthorization(options: CreatePreAuthorizationOptions): Promise<PreAuthorization>;
    private createPreAuthorizationRequest;
    /** Fetch mandate/pre-authorization status through `GET /mpp/v1/authorization/{id}`. */
    getMandate(mandateId: string): Promise<Mandate>;
    /** Retrieve an order through `GET /api/pay/v1/orders/{order_id}`. */
    getOrder(orderId: string): Promise<Order>;
    /** Initiate a refund through `POST /api/pay/v1/refunds/{order_id}`. */
    createRefund(orderId: string, options: CreateRefundOptions): Promise<Refund>;
    /** Fetch mandate balance/authorization status through `GET /mpp/v1/balance`. */
    getMandateBalance(options: MandateBalanceLookupOptions): Promise<MandateBalanceResult>;
    /** Create a mandate revoke request through `POST /mpp/v1/revoke`. */
    revokeMandate(options: CreateMandateRevokeOptions): Promise<MandateRevokeResult>;
    private request;
}
