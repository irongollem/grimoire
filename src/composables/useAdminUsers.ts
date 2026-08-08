import { useQuery, useMutation, useQueryClient } from '@tanstack/vue-query'
import { supabase } from '@/lib/supabase'
import { invokeDeleteAccount } from '@/composables/useAccountDeletion'
import type { PlanId } from '@/types/subscription.types'

export interface AdminUser {
  user_id: string
  email: string
  display_name: string | null
  created_at: string
  plan_id: string
  status: string
  ai_credits: number
  /** Soft freeze — paid actions blocked, login allowed. */
  suspended_at: string | null
  /** Hard lock-out — GoTrue ban, cannot sign in. */
  banned: boolean
}

async function fetchAdminUsers(): Promise<AdminUser[]> {
  const { data, error } = await supabase.rpc('get_admin_users')
  if (error) throw error
  return (data ?? []) as AdminUser[]
}

export function useAdminUsers() {
  const qc = useQueryClient()

  const query = useQuery({
    queryKey: ['admin', 'users'],
    queryFn: fetchAdminUsers,
    staleTime: 30_000,
  })

  const setPlan = useMutation({
    mutationFn: async ({ userId, planId }: { userId: string; planId: PlanId }) => {
      const { error } = await supabase
        .from('user_subscriptions')
        .update({ plan_id: planId, status: 'active' })
        .eq('user_id', userId)
      if (error) throw error
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['admin', 'users'] }),
  })

  // Soft freeze — blocks paid actions (credit-spend, new purchases); login stays.
  const setSuspended = useMutation({
    mutationFn: async ({ userId, suspended, reason }: { userId: string; suspended: boolean; reason?: string }) => {
      const { error } = await supabase
        .from('user_subscriptions')
        .update({
          suspended_at: suspended ? new Date().toISOString() : null,
          suspension_reason: suspended ? (reason ?? 'admin') : null,
        })
        .eq('user_id', userId)
      if (error) throw error
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['admin', 'users'] }),
  })

  // Hard lock-out — GoTrue ban via admin edge function; rejects sign-in.
  const setBanned = useMutation({
    mutationFn: async ({ userId, banned }: { userId: string; banned: boolean }) => {
      const { error } = await supabase.functions.invoke('admin-set-user-ban', { body: { userId, banned } })
      if (error) throw error
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['admin', 'users'] }),
  })

  const grantCredits = useMutation({
    mutationFn: async ({
      userId,
      amount,
      reason,
    }: {
      userId: string
      amount: number
      reason: string
    }) => {
      const { error } = await supabase.from('ai_credit_ledger').insert({
        user_id: userId,
        delta: amount,
        reason: reason || 'admin_grant',
        is_byok: false,
      })
      if (error) throw error
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['admin', 'users'] }),
  })

  // GDPR erasure (#631) — permanent, cascades owned campaigns, rejects admin targets
  // server-side (cannot_delete_admin). See useAccountDeletion.ts for the shared invoke.
  const deleteUser = useMutation({
    mutationFn: (userId: string) => invokeDeleteAccount(userId),
    onSettled: () => qc.invalidateQueries({ queryKey: ['admin', 'users'] }),
  })

  return { ...query, setPlan, grantCredits, setSuspended, setBanned, deleteUser }
}
