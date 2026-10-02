import { computed } from 'vue'
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'
import type { QuotaResource, QuotaResult } from '@/types/subscription.types'

const QUERY_KEY = 'quota'

async function fetchQuota(resourceType: QuotaResource): Promise<QuotaResult> {
  const { data, error } = await supabase.rpc('check_quota', { resource_type: resourceType })
  if (error) throw error
  return data as QuotaResult
}

/**
 * Whether an account holds more of a resource than its limit allows, which is
 * what sends it to the archive picker. Unloaded or unlimited is never over.
 * The count and limit are the database's (`check_quota`), so a young player's
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
    queryKey:  [QUERY_KEY, resourceType],
    queryFn:   () => fetchQuota(resourceType),
    // A quota belongs to an account. Asked signed out, the RPC answers 401,
    // which authAwareFetch reads as a session that died and redirects to
    // /login: that made every no-auth route under the app shell unreachable.
    enabled:   computed(() => auth.isAuthenticated),
    staleTime: 30_000,
  })

  const canCreate = computed(() => data.value?.allowed ?? true)

  const remaining = computed((): number | null => {
    if (!data.value || data.value.unlimited) return null
    return Math.max(0, data.value.limit - data.value.current)
  })

  return { canCreate, remaining, isLoading, quota: data }
}

// Fetch every resource's quota in ONE round-trip (vs one check_quota call per
// resource). Use this when a view needs the whole picture at once — e.g. the
// billing downgrade-impact panel — instead of N separate useQuota() calls.
export function useAllQuotas() {
  const auth = useAuthStore()

  // Admins are always unlimited — never over any free limit, so skip the call.
  if (auth.isAppAdmin) {
    return {
      data:      computed(() => ({}) as Partial<Record<QuotaResource, QuotaResult>>),
      isLoading: computed(() => false),
    }
  }

  const { data, isLoading } = useQuery({
    queryKey:  [QUERY_KEY, '__all__'],
    queryFn:   async (): Promise<Partial<Record<QuotaResource, QuotaResult>>> => {
      const { data, error } = await supabase.rpc('check_all_quotas')
      if (error) throw error
      return data as Partial<Record<QuotaResource, QuotaResult>>
    },
    enabled:   computed(() => auth.isAuthenticated),
    staleTime: 30_000,
  })

  return { data, isLoading }
}

// Call this from mutation composables after a successful create or delete
// to keep quota counts in sync without a full page reload.
export function useInvalidateQuota() {
  const queryClient = useQueryClient()
  return (resourceType: QuotaResource) => {
    // The batched read (useAllQuotas) holds the same count under its own key.
    queryClient.invalidateQueries({ queryKey: [QUERY_KEY, '__all__'] })
    return queryClient.invalidateQueries({ queryKey: [QUERY_KEY, resourceType] })
  }
}
