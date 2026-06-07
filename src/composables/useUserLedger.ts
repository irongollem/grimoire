import { computed, type Ref } from 'vue'
import { useQuery } from '@tanstack/vue-query'
import { supabase } from '@/lib/supabase'

export interface UserLedgerRow {
  id: string
  created_at: string
  reason: string
  delta: number
  model: string | null
  provider: string | null
  is_byok: boolean
  image_count: number | null
  input_tokens: number | null
  input_image_tokens: number | null
  output_tokens: number | null
  estimated_cost_usd_cents: number | null
  running_balance: number
}

const num = (v: unknown): number => (v === null || v === undefined ? 0 : Number(v))
const numOrNull = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v))

async function fetchUserLedger(userId: string): Promise<UserLedgerRow[]> {
  const { data, error } = await supabase.rpc('get_user_ledger', { p_user_id: userId })
  if (error) throw error
  // numeric columns arrive as strings over PostgREST — coerce to numbers.
  return (data ?? []).map((r: Record<string, unknown>) => ({
    id: r.id as string,
    created_at: r.created_at as string,
    reason: r.reason as string,
    delta: num(r.delta),
    model: (r.model as string | null) ?? null,
    provider: (r.provider as string | null) ?? null,
    is_byok: !!r.is_byok,
    image_count: numOrNull(r.image_count),
    input_tokens: numOrNull(r.input_tokens),
    input_image_tokens: numOrNull(r.input_image_tokens),
    output_tokens: numOrNull(r.output_tokens),
    estimated_cost_usd_cents: numOrNull(r.estimated_cost_usd_cents),
    running_balance: num(r.running_balance),
  }))
}

/** Admin-only per-user credit ledger (grants + generations) with derived totals. */
export function useUserLedger(userId: Ref<string>) {
  const query = useQuery({
    queryKey: ['admin', 'user-ledger', userId],
    queryFn: () => fetchUserLedger(userId.value),
    enabled: () => !!userId.value,
    staleTime: 30_000,
  })

  const rows = computed(() => query.data.value ?? [])

  // Rows come back newest-first; the latest row's running balance is the current total.
  const balance = computed(() => (rows.value.length ? rows.value[0].running_balance : 0))
  const granted = computed(() => rows.value.reduce((a, r) => a + (r.delta > 0 ? r.delta : 0), 0))
  const spent = computed(() => rows.value.reduce((a, r) => a + (r.delta < 0 ? -r.delta : 0), 0))
  const generationCount = computed(() => rows.value.filter((r) => r.model).length)
  const estimatedCostUsd = computed(
    () => rows.value.reduce((a, r) => a + (r.estimated_cost_usd_cents ?? 0), 0) / 100,
  )

  return {
    isPending: query.isPending,
    isError: query.isError,
    rows,
    balance,
    granted,
    spent,
    generationCount,
    estimatedCostUsd,
    refetch: query.refetch,
  }
}
