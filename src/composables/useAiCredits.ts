import { computed, ref } from 'vue'
import { useQuery } from '@tanstack/vue-query'
import { supabase } from '@/lib/supabase'
import type { AiGenerationType, CreditPackId } from '@/types/subscription.types'
import { CREDIT_COST } from '@/types/subscription.types'

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

  function canGenerate(type: AiGenerationType): boolean {
    return (balance.value ?? 0) >= CREDIT_COST[type]
  }

  async function deductCredit(reason: string, amount = 1): Promise<boolean> {
    const { data, error } = await supabase.functions.invoke('deduct-ai-credit', {
      body: { reason, amount },
    })
    if (error || data?.error) return false
    await refetch()
    return true
  }

  async function purchasePack(packId: CreditPackId): Promise<void> {
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
    deductCredit,
    purchasePack,
    purchaseLoading,
    purchaseError,
    refetch,
  }
}
