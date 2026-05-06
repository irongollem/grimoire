import { useQuery, useMutation, useQueryClient } from '@tanstack/vue-query'
import { supabase } from '@/lib/supabase'
import type { PlanId } from '@/types/subscription.types'

export interface AdminUser {
  user_id: string
  email: string
  display_name: string | null
  created_at: string
  plan_id: string
  status: string
  ai_credits: number
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

  return { ...query, setPlan, grantCredits }
}
