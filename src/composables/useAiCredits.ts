import { computed, ref } from 'vue'
import { useQuery } from '@tanstack/vue-query'
import { supabase } from '@/lib/supabase'
import { CREDIT_COST } from '@/types/subscription.types'
import { useGenerationCreditCosts } from '@/composables/useCreditConfig'
import type { TextUsage, ImageUsage } from '@/ai/providers/types'

/** Log a BYOK generation for cost analytics. Fire-and-forget — never blocks the caller. */
export function logUsage(params: {
  reason: string;
  textUsage?: TextUsage;
  imageUsage?: ImageUsage;
}): void {
  const { reason, textUsage, imageUsage } = params
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
      input_tokens:       textUsage?.input_tokens  ?? imageUsage?.input_tokens,
      input_image_tokens: imageUsage?.input_image_tokens,
      output_tokens:      textUsage?.output_tokens ?? imageUsage?.output_tokens,
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

export function useAiCredits() {
  const purchaseLoading = ref(false)
  const purchaseError = ref<string | null>(null)

  const { data: balance, isLoading, refetch } = useQuery({
    queryKey: ['ai-credit-balance'],
    queryFn: fetchBalance,
    staleTime: 30_000,
  })

  const { data: generationCosts } = useGenerationCreditCosts()

  function costOf(generationType: string): number {
    const row = generationCosts.value?.find((r) => r.generation_type === generationType)
    if (row) return row.credit_cost
    // Fallback to hardcoded constant while DB value is loading
    return (CREDIT_COST as Record<string, number>)[generationType] ?? 1
  }

  function canGenerate(generationType: string): boolean {
    return (balance.value ?? 0) >= costOf(generationType)
  }

  async function deductCredit(reason: string, amount = 1): Promise<boolean> {
    const { data, error } = await supabase.functions.invoke('deduct-ai-credit', {
      body: { reason, amount },
    })
    if (error || data?.error) return false
    await refetch()
    return true
  }

  async function purchasePack(packId: string): Promise<void> {
    purchaseLoading.value = true
    purchaseError.value = null
    try {
      const { data, error } = await supabase.functions.invoke(
        'stripe-create-credit-checkout',
        { body: { packId } },
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
    isLoading,
    canGenerate,
    costOf,
    deductCredit,
    logUsage: logUsage,
    purchasePack,
    purchaseLoading,
    purchaseError,
    refetch,
  }
}
