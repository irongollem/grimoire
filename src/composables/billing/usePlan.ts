import { useQuery } from '@tanstack/vue-query'
import { supabase } from '@/lib/supabase'
import type { Plan, PlanId } from '@/types/subscription.types'

// The table holds a handful of rows, so every usePlan() shares one read.
async function fetchPlans(): Promise<Plan[]> {
  const { data, error } = await supabase.from('plans').select('*')
  if (error) throw error
  return data as Plan[]
}

export function usePlan(id: PlanId) {
  return useQuery({
    queryKey: ['plans'],
    queryFn: fetchPlans,
    select: (plans): Plan => {
      const plan = plans.find((p) => p.id === id)
      // `.single()` used to make a missing row an error; keep it one.
      if (!plan) throw new Error(`Plan "${id}" not found`)
      return plan
    },
    staleTime: Infinity,
  })
}
