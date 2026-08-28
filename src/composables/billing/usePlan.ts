import { useQuery } from '@tanstack/vue-query'
import { supabase } from '@/lib/supabase'
import type { Plan, PlanId } from '@/types/subscription.types'

async function fetchPlan(id: PlanId): Promise<Plan> {
  const { data, error } = await supabase.from('plans').select('*').eq('id', id).single()
  if (error) throw error
  return data as Plan
}

export function usePlan(id: PlanId) {
  return useQuery({
    queryKey: ['plan', id],
    queryFn: () => fetchPlan(id),
    staleTime: Infinity,
  })
}
