export type PlanId = 'free' | 'tester' | 'pro'

export type SubscriptionStatus = 'active' | 'trialing' | 'past_due' | 'cancelled'

export interface PlanPrice {
  monthly: number
  yearly: number
}

export interface Plan {
  id: PlanId
  name: string
  stripe_price_id: string | null
  stripe_annual_price_id: string | null
  stripe_monthly_unit_amount: number | null
  stripe_annual_unit_amount: number | null
  stripe_currency: string | null
  stripe_monthly_currency_options: Record<string, { unit_amount: number }> | null
  stripe_annual_currency_options: Record<string, { unit_amount: number }> | null
  prices: Record<string, PlanPrice>
  quotas: Partial<Record<QuotaResource, number>>
}

export type QuotaResource =
  | 'campaigns'
  | 'npcs'
  | 'monsters'
  | 'encounters'
  | 'scriptorium_documents'
  | 'notes'
  | 'sounds'
  | 'soundboard_pages'
  | 'soundboard_playlists'

export const QUOTA_RESOURCE_LABELS: Record<QuotaResource, string> = {
  campaigns:             'Campaigns',
  npcs:                  'NPCs',
  monsters:              'Custom monsters',
  encounters:            'Encounters',
  scriptorium_documents: 'Scriptorium documents',
  notes:                 'Notes',
  sounds:                'Sounds',
  soundboard_pages:      'Soundboard pages',
  soundboard_playlists:  'Playlists',
} as const

export interface UserSubscription {
  user_id: string
  plan_id: PlanId
  status: SubscriptionStatus
  stripe_customer_id: string | null
  stripe_subscription_id: string | null
  current_period_end: string | null
  cancel_at_period_end: boolean
  cancel_at: string | null
  created_at: string
  updated_at: string
}

export interface QuotaResult {
  allowed: boolean
  current: number
  limit: number       // -1 = unlimited
  unlimited: boolean
}

export type CreditPackId = 'starter' | 'standard' | 'bulk'

export type AiGenerationType = 'portrait' | 'npc_text' | 'monster_stat_block' | 'music_clip' | 'music_full_song'

export const CREDIT_COST: Record<AiGenerationType, number> = {
  portrait:           2,
  npc_text:           1,
  monster_stat_block: 1,
  music_clip:         1,
  music_full_song:    2,
} as const

export const CREDIT_PACKS: Record<CreditPackId, { label: string; credits: number; eur: number }> = {
  starter:  { label: 'Starter',  credits: 15, eur: 5  },
  standard: { label: 'Standard', credits: 35, eur: 10 },
  bulk:     { label: 'Bulk',     credits: 80, eur: 20 },
} as const

export interface AiCreditLedgerRow {
  id: string
  user_id: string
  delta: number
  reason: string
  stripe_payment_intent_id: string | null
  subscription_period_start: string | null
  model: string | null
  provider: string | null
  input_tokens: number | null
  output_tokens: number | null
  image_count: number | null
  is_byok: boolean
  created_at: string
}
