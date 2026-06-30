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
    staleTime: 30_000,
  })

  return { data, isLoading }
}

// Call this from mutation composables after a successful create or delete
// to keep quota counts in sync without a full page reload.
export function useInvalidateQuota() {
  const queryClient = useQueryClient()
  return (resourceType: QuotaResource) =>
    queryClient.invalidateQueries({ queryKey: [QUERY_KEY, resourceType] })
}
