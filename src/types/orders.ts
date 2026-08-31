import type { Amount, PaymentMethod } from "./index";

export interface OrderAddress {
  address1?: string;
  address2?: string;
  address3?: string;
  pincode?: string;
  city?: string;
  state?: string;
  country?: string;
}

export interface OrderCustomer {
  email_id?: string;
  first_name?: string;
  last_name?: string;
  customer_id?: string;
  mobile_number?: string;
  billing_address?: OrderAddress;
  shipping_address?: OrderAddress;
}

export interface OrderPurchaseDetails {
  customer?: OrderCustomer;
  merchant_metadata?: Record<string, unknown>;
}

export interface OrderCardData {
  card_type?: string;
  network_name?: string;
  issuer_name?: string;
  card_category?: string;
  country_code?: string;
  token_txn_type?: string;
}

export interface OrderPaymentOption {
  card_data?: OrderCardData;
}

export interface OrderAcquirerData {
  approval_code?: string;
  acquirer_reference?: string;
  rrn?: string;
  is_aggregator?: boolean;
}

export interface OrderPayment {
  id: string;
  status: string;
  payment_amount: Amount;
  payment_method: PaymentMethod | string;
  payment_option?: OrderPaymentOption;
  acquirer_data?: OrderAcquirerData;
  created_at?: string;
  updated_at?: string;
}

/** Typed order returned by `getOrder`; `raw` retains future upstream fields. */
export interface Order {
  order_id: string;
  merchant_order_reference: string;
  type: string;
  status: string;
  merchant_id: string;
  order_amount: Amount;
  pre_auth: boolean;
  purchase_details?: OrderPurchaseDetails;
  payments: OrderPayment[];
  created_at?: string;
  updated_at?: string;
  raw: Record<string, unknown>;
}

export interface CreateRefundOptions {
  merchantOrderReference: string;
  /** Refund amount in the smallest currency unit, e.g. paise for INR. */
  orderAmount: Amount;
  merchantMetadata?: Record<string, unknown>;
}

export interface Refund extends Order {
  parent_order_id: string;
}
