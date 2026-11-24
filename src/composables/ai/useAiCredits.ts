import { computed, ref } from 'vue'
import { useQuery } from '@tanstack/vue-query'
import { supabase, getCurrentUser } from '@/lib/supabase'
import { edgeErrorMessage } from '@edge-shared/edgeError.ts'
import { CREDIT_COST, type CreditBuckets } from '@/types/subscription.types'
import { useGenerationCreditCosts } from '@/composables/billing/useCreditConfig'
// The single place a charge becomes a whole number of credits (rounded up) —
// imported from the edge function's own pure, dependency-free module rather
// than mirrored, so there is exactly one implementation of this rule and the
// UI's displayed cost cannot drift from what the server actually charges.
import { wholeCredits } from '@edge-shared/credit-math.ts'

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

async function fetchBalance(): Promise<number> {
  const user = getCurrentUser()
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
  const user = getCurrentUser()
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
    return wholeCredits(base * sizeMultiplier(opts?.size))
  }

  /**
   * Whether a generation costing `credits` is affordable. We never block while the
   * balance is still loading. Shared by GenerationCostBadge and the generate
   * buttons so the disabled state and the cost tint stay in sync.
   */
  function affordable(credits: number): boolean {
    return isLoading.value || (balance.value ?? 0) >= credits
  }

  /** `returnPath` — where Stripe sends the buyer back to; Billing when omitted. */
  async function purchasePack(packId: string, withdrawalConsent = false, returnPath?: string): Promise<void> {
    purchaseLoading.value = true
    purchaseError.value = null
    try {
      const { data, error } = await supabase.functions.invoke(
        'stripe-create-credit-checkout',
        { body: { packId, withdrawalConsent, returnPath } },
      )
      if (error) throw new Error(await edgeErrorMessage(error))
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
    affordable,
    costOf,
    purchasePack,
    purchaseLoading,
    purchaseError,
    refetch,
    refetchBuckets,
  }
}
