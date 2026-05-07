import { useQuery, useMutation, useQueryClient } from '@tanstack/vue-query'
import { supabase } from '@/lib/supabase'
import type { Plan, QUOTA_RESOURCE_LABELS } from '@/types/subscription.types'
import { QUOTA_RESOURCE_LABELS as LABELS } from '@/types/subscription.types'

export type { QUOTA_RESOURCE_LABELS }

async function fetchPlans(): Promise<Plan[]> {
  const { data, error } = await supabase.from('plans').select('*').order('id')
  if (error) throw error
  return (data ?? []) as Plan[]
}

export function useAdminPlans() {
  const qc = useQueryClient()

  const query = useQuery({
    queryKey: ['admin', 'plans'],
    queryFn: fetchPlans,
    staleTime: 30_000,
  })

  const updateQuotas = useMutation({
    mutationFn: async ({ planId, quotas }: { planId: string; quotas: Record<string, number> }) => {
      const { error } = await supabase
        .from('plans')
        .update({ quotas })
        .eq('id', planId)
      if (error) throw error
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['admin', 'plans'] }),
  })

  const syncPlanPrices = useMutation({
    mutationFn: async (args: { planId: string; monthlyPriceId?: string; annualPriceId?: string }) => {
      const { data: { session } } = await supabase.auth.getSession()
      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-sync-stripe-plan-prices`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${session?.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(args),
        },
      )
      if (!resp.ok) {
        const msg = await resp.text()
        throw new Error(msg || 'Sync failed')
      }
      return resp.json()
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'plans'] })
      qc.invalidateQueries({ queryKey: ['plan'] })
    },
  })

  return { ...query, updateQuotas, syncPlanPrices, LABELS }
}
