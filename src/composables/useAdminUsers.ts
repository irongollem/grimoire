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

  // Every mutation below goes through an RPC rather than a direct table write.
  // That is not a style preference: each RPC writes its `admin_audit_log` entry
  // in the same transaction as the change (#642), and migration 20260809214703
  // dropped the admin write policies these used to rely on, so this is now the
  // only path. A log the actor could route around by issuing the PostgREST call
  // themselves would not be worth keeping.
  const setPlan = useMutation({
    mutationFn: async ({ userId, planId }: { userId: string; planId: PlanId }) => {
      const { error } = await supabase.rpc('admin_set_user_plan', {
        p_user_id: userId,
        p_plan_id: planId,
      })
      if (error) throw error
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['admin', 'users'] }),
  })

  // Soft freeze — blocks paid actions (credit-spend, new purchases); login stays.
  const setSuspended = useMutation({
    mutationFn: async ({ userId, suspended, reason }: { userId: string; suspended: boolean; reason?: string }) => {
      const { error } = await supabase.rpc('admin_set_user_suspended', {
        p_user_id: userId,
        p_suspended: suspended,
        p_reason: reason ?? null,
      })
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
      const { error } = await supabase.rpc('admin_grant_credits', {
        p_user_id: userId,
        p_delta: amount,
        p_reason: reason || 'admin_grant',
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
