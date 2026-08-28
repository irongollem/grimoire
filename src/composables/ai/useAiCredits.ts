import { computed, ref } from 'vue'
import { useQuery } from '@tanstack/vue-query'
import { supabase } from '@/lib/supabase'
import { CREDIT_COST, type CreditBuckets } from '@/types/subscription.types'
import { useGenerationCreditCosts } from '@/composables/billing/useCreditConfig'
import type { TextUsage, ImageUsage } from '@/ai/providers/types'

/**
 * Credit multiplier for an image render based on its pixel area, relative to a
 * 1024×1024 square baseline (= 1.0). A 1536×1024 / 1024×1536 render is 1.5×.
 * Mirrors `sizeMultiplier()` in the edge functions' `_shared/credits.ts` so the
 * cost shown in the UI matches what the server charges. Returns 1 for unknown
 * or blank sizes (text generations, fixed-square functions).
 */
export function sizeMultiplier(size: string | null | undefined): number {
  if (!size) return 1
  const m = /^(\d+)\s*x\s*(\d+)$/i.exec(size.trim())
  if (!m) return 1
  const area = Number(m[1]) * Number(m[2])
  if (!Number.isFinite(area) || area <= 0) return 1
  return area / (1024 * 1024)
}

/**
 * Log a BYOK/local-key generation for the AI usage record. Fire-and-forget —
 * never blocks the caller. Every call site is a client-direct (BYOK or local
 * key vault) provider call, so `is_byok: true` is always correct here — the
 * platform-key path is logged server-side instead (recordGeneration() /
 * spend_credits(), see `_shared/credits.ts`).
 *
 * #609: every generation logs a row, even when the provider didn't report
 * token counts (some responses omit them — see `ImageUsage`).
 * Token columns land NULL in that case; delta stays 0 and model/provider/
 * reason are always present, so the usage record stays complete even where
 * it can't estimate cost. This never sends prompt content — only the
 * generator type (`reason`), provider, model and token/image counts — so
 * local-key mode's "plaintext never reaches the server" promise holds for
 * this beacon too (context/compliance/ai-act.md §6a).
 */
export function logUsage(params:
  | { reason: string; textUsage: TextUsage; imageUsage?: never }
  | { reason: string; imageUsage: ImageUsage; textUsage?: never }
): void {
  const { reason, textUsage, imageUsage } = params
  const inputTokens      = textUsage?.input_tokens  ?? imageUsage?.input_tokens
  const inputImageTokens = imageUsage?.input_image_tokens
  const outputTokens     = textUsage?.output_tokens ?? imageUsage?.output_tokens

  supabase.functions.invoke('deduct-ai-credit', {
    body: {
      reason,
      amount: 0,
      is_byok: true,
      model:              textUsage?.model    ?? imageUsage?.model,
      provider:           textUsage?.provider ?? imageUsage?.provider,
      // Token-based image models (OpenAI gpt-image) report tokens on imageUsage;
      // text generators report on textUsage. Forward whichever is present so the
      // ledger can compute real cost on every path.
      input_tokens:       inputTokens,
      input_image_tokens: inputImageTokens,
      output_tokens:      outputTokens,
      image_count:        imageUsage?.image_count,
    },
  }).catch(() => { /* analytics logging failure is never fatal */ })
}

async function fetchBalance(): Promise<number> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return 0

  const { data, error } = await supabase
    .from('ai_credit_balance')
    .select('balance')
    .eq('user_id', user.id)
    .maybeSingle()

  if (error) throw error
  return (data?.balance as number) ?? 0
}

async function fetchBuckets(): Promise<CreditBuckets> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { subscription_balance: 0, purchased_balance: 0 }

  const { data, error } = await supabase
    .from('ai_credit_buckets')
    .select('subscription_balance, purchased_balance')
    .eq('user_id', user.id)
    .maybeSingle()

  if (error) throw error
  // subscription_balance can be transiently negative (concurrent over-draw); clamp for display.
  return {
    subscription_balance: Math.max(0, (data?.subscription_balance as number) ?? 0),
    purchased_balance: Math.max(0, (data?.purchased_balance as number) ?? 0),
  }
}

export function useAiCredits() {
  const purchaseLoading = ref(false)
  const purchaseError = ref<string | null>(null)

  const { data: balance, isLoading, refetch } = useQuery({
    queryKey: ['ai-credit-balance'],
    queryFn: fetchBalance,
    staleTime: 30_000,
  })

  const { data: buckets, refetch: refetchBuckets } = useQuery({
    queryKey: ['ai-credit-buckets'],
    queryFn: fetchBuckets,
    staleTime: 30_000,
  })

  const subscriptionBalance = computed(() => buckets.value?.subscription_balance ?? 0)
  const purchasedBalance = computed(() => buckets.value?.purchased_balance ?? 0)

  const { data: generationCosts } = useGenerationCreditCosts()

  function costOf(generationType: string, opts?: { size?: string | null }): number {
    const row = generationCosts.value?.find((r) => r.generation_type === generationType)
    // Fallback to hardcoded constant while DB value is loading
    const base = row ? row.credit_cost : ((CREDIT_COST as Record<string, number>)[generationType] ?? 1)
    return Math.round(base * sizeMultiplier(opts?.size) * 100) / 100
  }

  function canGenerate(generationType: string): boolean {
    return (balance.value ?? 0) >= costOf(generationType)
  }

  /**
   * Whether a generation costing `credits` is affordable. BYOK is always
   * affordable (the user pays their own API bill), and we never block while the
   * balance is still loading. Shared by GenerationCostBadge and the generate
   * buttons so the disabled state and the cost tint stay in sync.
   */
  function affordable(credits: number, byok = false): boolean {
    return byok || isLoading.value || (balance.value ?? 0) >= credits
  }

  async function purchasePack(packId: string, withdrawalConsent = false): Promise<void> {
    purchaseLoading.value = true
    purchaseError.value = null
    try {
      const { data, error } = await supabase.functions.invoke(
        'stripe-create-credit-checkout',
        { body: { packId, withdrawalConsent } },
      )
      if (error) throw new Error(error.message)
      if (data?.url) window.location.href = data.url
    } catch (err) {
      purchaseError.value = err instanceof Error ? err.message : 'Failed to start checkout'
    } finally {
      purchaseLoading.value = false
    }
  }

  const formattedBalance = computed(() => {
    const b = balance.value ?? 0
    return b === 1 ? '1 credit' : `${b} credits`
  })

  return {
    balance,
    formattedBalance,
    subscriptionBalance,
    purchasedBalance,
    isLoading,
    canGenerate,
    affordable,
    costOf,
    logUsage: logUsage,
    purchasePack,
    purchaseLoading,
    purchaseError,
    refetch,
    refetchBuckets,
  }
}
