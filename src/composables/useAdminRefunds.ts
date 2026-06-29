import { type Ref } from 'vue'
import { useQuery, useMutation, useQueryClient } from '@tanstack/vue-query'
import { supabase } from '@/lib/supabase'

/** One purchased credit pack with FIFO-computed refund eligibility. */
export interface PackLot {
  paymentIntentId: string
  credits: number
  purchasedAt: string
  remaining: number
  consumed: number
  alreadyRefunded: boolean
  withinWindow: boolean
  eligible: boolean
}

export interface RefundResult {
  ok: boolean
  refundId: string
  clawedBack: number
}

/**
 * Invoke the admin-refund edge function, surfacing the JSON body of a non-2xx
 * response on the thrown error (`.payload`) so callers can branch on business
 * outcomes like `not_eligible` to drive the override flow.
 */
async function invokeRefundFn<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('admin-refund-credit-pack', { body })
  if (error) {
    let payload: { error?: string; detail?: string; lot?: PackLot } | null = null
    try {
      payload = await (error as unknown as { context?: Response }).context?.json() ?? null
    } catch {
      /* response had no JSON body */
    }
    const e = new Error(payload?.error ?? error.message) as Error & {
      payload?: { error?: string; detail?: string; lot?: PackLot } | null
    }
    e.payload = payload
    throw e
  }
  return data as T
}

/** Admin-only credit-pack refund eligibility + execution for one user. */
export function useAdminRefunds(userId: Ref<string>) {
  const qc = useQueryClient()

  const query = useQuery({
    queryKey: ['admin', 'refund-lots', userId],
    queryFn: () =>
      invokeRefundFn<{ lots: PackLot[]; purchasedBalance: number }>({ action: 'list', userId: userId.value }),
    enabled: () => !!userId.value,
    staleTime: 30_000,
  })

  const refundPack = useMutation({
    mutationFn: (vars: { paymentIntentId: string; override?: boolean; reason?: string }) =>
      invokeRefundFn<RefundResult>({ action: 'refund', userId: userId.value, ...vars }),
    onSuccess: () => {
      // Refresh eligibility, the per-user ledger, and the users balance column.
      qc.invalidateQueries({ queryKey: ['admin', 'refund-lots', userId] })
      qc.invalidateQueries({ queryKey: ['admin', 'user-ledger', userId] })
      qc.invalidateQueries({ queryKey: ['admin', 'users'] })
    },
  })

  return { query, refundPack }
}
