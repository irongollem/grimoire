export type PlanId = 'free' | 'pro'

export type SubscriptionStatus = 'active' | 'trialing' | 'past_due' | 'cancelled'

export interface Plan {
  id: PlanId
  name: string
  stripe_price_id: string | null
  quotas: Partial<Record<QuotaResource, number>>
}

export type QuotaResource =
  | 'campaigns'
  | 'npcs'
  | 'monsters'
  | 'encounters'
  | 'scriptorium_documents'
  | 'notes'

export interface UserSubscription {
  user_id: string
  plan_id: PlanId
  status: SubscriptionStatus
  stripe_customer_id: string | null
  stripe_subscription_id: string | null
  current_period_end: string | null
  created_at: string
  updated_at: string
}

export interface QuotaResult {
  allowed: boolean
  current: number
  limit: number       // -1 = unlimited
  unlimited: boolean
}
