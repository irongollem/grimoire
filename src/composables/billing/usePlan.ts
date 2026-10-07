import { useQuery } from '@tanstack/vue-query'
import { supabase } from '@/lib/supabase'
import type { Plan, PlanId } from '@/types/subscription.types'

// The table holds a handful of rows, so every usePlan() shares one read.
async function fetchPlans(): Promise<Plan[]> {
  const { data, error } = await supabase.from('plans').select('*')
  if (error) throw error
  return data as Plan[]
}

/**
 * `enabled` lets a surface that is usually closed (a paywall mounted on every
 * list page) read the plans only once it opens (#999).
 */
export function usePlan(id: PlanId, enabled: () => boolean = () => true) {
  return useQuery({
    queryKey: ['plans'],
    queryFn: fetchPlans,
    enabled,
    select: (plans): Plan => {
      const plan = plans.find((p) => p.id === id)
      // `.single()` used to make a missing row an error; keep it one.
      if (!plan) throw new Error(`Plan "${id}" not found`)
      return plan
    },
    // The plans do not change during a session, so the list is fresh for good
    // once it holds the plan asked for. If it does not, the list counts as stale
    // for this observer, so the next mount asks again instead of serving the
    // same incomplete answer for the rest of the session.
    staleTime: (query) => (query.state.data?.some((p) => p.id === id) ? Infinity : 0),
  })
}
