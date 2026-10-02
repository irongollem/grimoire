import { computed } from 'vue'
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'
import type { QuotaResource, QuotaResult } from '@/types/subscription.types'

const QUERY_KEY = 'quota'

type AllQuotas = Partial<Record<QuotaResource, QuotaResult>>

// ONE query answers every resource. `check_all_quotas` applies the same plan
// lookup, exemptions and counting rules as `check_quota` for all fifteen
// QuotaResource values, so the shell can mount any number of useQuota() calls
// and still send a single request. Every consumer observes this key.
const ALL_QUOTAS_KEY = [QUERY_KEY, '__all__'] as const

async function fetchAllQuotas(): Promise<AllQuotas> {
  const { data, error } = await supabase.rpc('check_all_quotas')
  if (error) throw error
  return data as AllQuotas
}

/**
 * Whether an account holds more of a resource than its limit allows, which is
 * what sends it to the archive picker. Unloaded or unlimited is never over.
 * The count and limit are the database's (`check_all_quotas`), so a young player's
 * inherited limits and a lapsed parent's plan both land here correctly.
 */
export function isOverQuota(quota: QuotaResult | undefined): boolean {
  return !!quota && !quota.unlimited && quota.current > quota.limit
}

export function useQuota(resourceType: QuotaResource) {
  const auth = useAuthStore()

  // Admins are always unlimited — skip the DB call entirely
  if (auth.isAppAdmin) {
    const unlimited: QuotaResult = { allowed: true, current: 0, limit: -1, unlimited: true }
    return {
      canCreate:  computed(() => true),
      remaining:  computed(() => null as number | null),
      isLoading:  computed(() => false),
      quota:      computed(() => unlimited),
    }
  }

  const { data, isLoading } = useQuery({
    queryKey:  ALL_QUOTAS_KEY,
    queryFn:   fetchAllQuotas,
    select:    (all): QuotaResult => {
      const result = all[resourceType]
      // The server returns every QuotaResource; a missing one means the SQL
      // allowlist and the client type drifted apart. Surface it as a query
      // error rather than inventing an answer.
      if (!result) throw new Error(`check_all_quotas returned no entry for "${resourceType}"`)
      return result
    },
    // A quota belongs to an account. Asked signed out, the RPC answers 401,
    // which authAwareFetch reads as a session that died and redirects to
    // /login: that made every no-auth route under the app shell unreachable.
    enabled:   computed(() => auth.isAuthenticated),
    staleTime: 30_000,
  })

  // Allowed while `data` is undefined (loading, or errored): the server still
  // enforces the cap on the write, so the UI never blocks on a pending read.
  const canCreate = computed(() => data.value?.allowed ?? true)

  const remaining = computed((): number | null => {
    if (!data.value || data.value.unlimited) return null
    return Math.max(0, data.value.limit - data.value.current)
  })

  return { canCreate, remaining, isLoading, quota: data }
}

// Every resource's quota in ONE round-trip, sharing the query useQuota() reads.
// Use this when a view needs the whole picture at once — e.g. the billing
// downgrade-impact panel.
export function useAllQuotas() {
  const auth = useAuthStore()

  // Admins are always unlimited — never over any free limit, so skip the call.
  if (auth.isAppAdmin) {
    return {
      data:      computed(() => ({}) as AllQuotas),
      isLoading: computed(() => false),
    }
  }

  const { data, isLoading } = useQuery({
    queryKey:  ALL_QUOTAS_KEY,
    queryFn:   fetchAllQuotas,
    enabled:   computed(() => auth.isAuthenticated),
    staleTime: 30_000,
  })

  return { data, isLoading }
}

// Call this from mutation composables after a successful create or delete
// to keep quota counts in sync without a full page reload. All resources share
// one query now, so the argument only documents which resource changed at the
// call site; the whole batch is refetched.
export function useInvalidateQuota(): (resourceType: QuotaResource) => Promise<void> {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: ALL_QUOTAS_KEY })
}
