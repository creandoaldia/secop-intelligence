// ─────────────────────────────────────────────────────────────
// SECOP Intelligence Hub — MercadoPago Types
// Preferences, payments, webhooks, subscriptions
// ─────────────────────────────────────────────────────────────

export interface MPPreferenceRequest {
  items: Array<{
    id: string;
    title: string;
    description?: string;
    quantity: number;
    unit_price: number;
    currency_id?: string; // default "COP"
    category_id?: string;
  }>;
  payer?: {
    email?: string;
  };
  back_urls?: {
    success?: string;
    failure?: string;
    pending?: string;
  };
  auto_return?: "approved" | "all";
  notification_url?: string;
  statement_descriptor?: string;
  metadata?: Record<string, unknown>;
}

export interface MPPreferenceResponse {
  id: string;
  init_point: string;
  sandbox_init_point: string;
  collector_id: number;
  client_id: string;
  date_created: string;
  metadata?: Record<string, unknown>;
}

export interface MPSubscriptionRequest {
  preapproval_plan_id?: string;
  reason: string;
  external_reference?: string;
  payer_email?: string;
  card_token_id?: string;
  auto_recurring: {
    frequency: number;
    frequency_type: "days" | "months";
    transaction_amount: number;
    currency_id: string;
    repetitions?: number;
    billing_day?: number;
    billing_day_proportional?: boolean;
    free_trial?: {
      frequency: number;
      frequency_type: "days" | "months";
    };
  };
  status?: "authorized" | "pending";
  back_url?: string;
  notification_url?: string;
}

export interface MPSubscriptionResponse {
  id: string;
  preapproval_plan_id?: string;
  reason: string;
  external_reference?: string;
  status: "authorized" | "pending" | "cancelled" | "paused";
  init_point?: string;
  auto_recurring: {
    frequency: number;
    frequency_type: string;
    transaction_amount: number;
    currency_id: string;
    next_shipment_date?: string;
  };
  summarized?: {
    quotas: number;
    paid_quantity: number;
    pending_charge_quantity: number;
    charged_quantity: number;
    last_charged_date?: string;
    last_charged_amount?: number;
    semaphore: "green" | "yellow" | "red";
  };
  date_created: string;
  last_modified: string;
}

export interface MPWebhookEvent {
  id: string;
  type: "payment" | "subscription_authorized" | "subscription_cancelled"
    | "subscription_updated" | "preapproval" | "preapproval_plan"
    | "chargeback" | "refund" | "merchant_order";
  action: "payment.created" | "payment.updated" | string;
  data: {
    id: string;
  };
  date_created: string;
  live_mode: boolean;
  api_version: string;
}

export interface MPWebhookNotification {
  topic: "payment" | "subscription" | "preapproval" | "merchant_order";
  id: string;
  type?: string;
  action?: string;
  data_id?: string;
  data?: {
    id: string;
  };
}

export type PlanType = "basic" | "pro" | "premium";

export interface PlanPricing {
  plan: PlanType;
  label: string;
  price: number;
  currency: string;
  pagesPerMonth: number;
  mpPreapprovalPlanId?: string;
}

export const PLAN_PRICING: Record<PlanType, PlanPricing> = {
  basic: {
    plan: "basic",
    label: "Basic",
    price: 29000,
    currency: "COP",
    pagesPerMonth: 600,
  },
  pro: {
    plan: "pro",
    label: "Pro",
    price: 79000,
    currency: "COP",
    pagesPerMonth: 3000,
  },
  premium: {
    plan: "premium",
    label: "Premium",
    price: 199000,
    currency: "COP",
    pagesPerMonth: 10000,
  },
};
