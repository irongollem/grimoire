import { computed } from 'vue'
import { useQuery } from '@tanstack/vue-query'
import { supabase } from '@/lib/supabase'

interface AiGenerationCostRow {
  id: string
  user_id: string
  delta: number
  reason: string
  model: string | null
  provider: string | null
  input_tokens: number | null
  input_image_tokens: number | null
  output_tokens: number | null
  image_count: number | null
  is_byok: boolean
  created_at: string
  estimated_cost_usd_cents: number | null
}

export interface ModelStat {
  model: string
  provider: string
  count: number
  byok_count: number
  total_input_tokens: number
  total_input_image_tokens: number
  total_output_tokens: number
  total_images: number
  estimated_cost_usd: number
  /** Mean estimated cost per generation (estimated_cost_usd / count). */
  avg_cost_usd: number
}

async function fetchGenerationCosts(): Promise<AiGenerationCostRow[]> {
  const { data, error } = await supabase
    .from('ai_generation_costs')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as AiGenerationCostRow[]
}

export function useAiUsageStats() {
  const query = useQuery({
    queryKey: ['admin', 'ai-usage-stats'],
    queryFn: fetchGenerationCosts,
    staleTime: 60_000,
  })

  const rows = computed(() => query.data.value ?? [])

  const totalGenerations = computed(() => rows.value.length)

  const byokCount = computed(() => rows.value.filter((r) => r.is_byok).length)

  const totalEstimatedCostUsd = computed(() => {
    const sum = rows.value.reduce(
      (acc, r) => acc + (r.estimated_cost_usd_cents ?? 0),
      0,
    )
    return sum / 100
  })

  const modelStats = computed((): ModelStat[] => {
    const map = new Map<string, ModelStat>()
    for (const row of rows.value) {
      const key = row.model ?? '(unknown)'
      if (!map.has(key)) {
        map.set(key, {
          model: key,
          provider: row.provider ?? '(unknown)',
          count: 0,
          byok_count: 0,
          total_input_tokens: 0,
          total_input_image_tokens: 0,
          total_output_tokens: 0,
          total_images: 0,
          estimated_cost_usd: 0,
          avg_cost_usd: 0,
        })
      }
      const stat = map.get(key)!
      stat.count++
      if (row.is_byok) stat.byok_count++
      stat.total_input_tokens       += row.input_tokens       ?? 0
      stat.total_input_image_tokens += row.input_image_tokens ?? 0
      stat.total_output_tokens      += row.output_tokens      ?? 0
      stat.total_images             += row.image_count        ?? 0
      stat.estimated_cost_usd       += (row.estimated_cost_usd_cents ?? 0) / 100
    }
    const stats = [...map.values()]
    for (const s of stats) s.avg_cost_usd = s.count ? s.estimated_cost_usd / s.count : 0
    return stats.sort((a, b) => b.count - a.count)
  })

  return {
    isPending: query.isPending,
    isError:   query.isError,
    totalGenerations,
    byokCount,
    totalEstimatedCostUsd,
    modelStats,
    refetch: query.refetch,
  }
}
