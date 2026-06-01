import { CreateMandateOptions, Mandate, PluralSellerConfig } from "../types";
export declare class ApiClient {
    private config;
    private readonly baseUrl;
    private readonly fetchImpl;
    private readonly auth;
    constructor(config: PluralSellerConfig);
    /** Create an P3P mandate/pre-authorization and normalize the service response. */
    createMandate(options: CreateMandateOptions): Promise<Mandate>;
    /** Fetch mandate/pre-authorization status through `GET /mpp/v1/authorization/{id}`. */
    getMandate(mandateId: string): Promise<Mandate>;
    private request;
}
