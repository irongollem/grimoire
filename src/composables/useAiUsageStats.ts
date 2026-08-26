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
  quality: string | null
  size: string | null
  input_tokens: number | null
  input_image_tokens: number | null
  output_tokens: number | null
  image_count: number | null
  is_byok: boolean
  created_at: string
  estimated_cost_usd_cents: number | null
}

/**
 * One row per *variant*, not per model.
 *
 * A model name is not a price. `gpt-image-2` bills a 1024x1024 low tile at about
 * 0.9 US cents and a 1024x1536 high portrait at 23.8 — the same per-token rates,
 * 26x apart on token count — so averaging them produces a number that describes
 * neither. It also moves with traffic mix rather than with cost: a tile pack
 * emits 20+ low renders against one portrait, so once packs ship, a
 * model-keyed average would collapse toward the tile and make the model look an
 * order of magnitude cheaper than it is for ordinary image work.
 */
export type { AiGenerationCostRow }

export interface ModelStat {
  model: string
  provider: string
  /** Provider quality tier, when the row recorded one. */
  quality: string | null
  /** Requested render size, when the row recorded one. */
  size: string | null
  /** `model`, or `model (low 1024x1024)` when the row identifies a variant. */
  label: string
  count: number
  byok_count: number
  total_input_tokens: number
  total_input_image_tokens: number
  total_output_tokens: number
  total_images: number
  estimated_cost_usd: number
  /** Mean estimated cost per generation (estimated_cost_usd / count). */
  avg_cost_usd: number
  /** Credits actually charged (−delta summed; BYOK rows contribute 0). */
  credits: number
  /** Charged (non-BYOK) generation count — credits only apply to these. */
  charged_count: number
  /** Mean credits per *charged* generation (credits / charged_count). */
  avg_credits: number
}

async function fetchGenerationCosts(): Promise<AiGenerationCostRow[]> {
  const { data, error } = await supabase
    .from('ai_generation_costs')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as AiGenerationCostRow[]
}

/**
 * Fold cost rows into one entry per variant. Pure and exported so the keying is
 * testable: which rows share a bucket is the whole correctness question here.
 */
export function aggregateModelStats(rows: AiGenerationCostRow[]): ModelStat[] {
  const map = new Map<string, ModelStat>()
  for (const row of rows) {
    const model = row.model ?? '(unknown)'
    const variant = [row.quality, row.size].filter(Boolean).join(' ')
    const key = `${model}\u0000${row.quality ?? ''}\u0000${row.size ?? ''}`
    if (!map.has(key)) {
      map.set(key, {
        model,
        provider: row.provider ?? '(unknown)',
        quality: row.quality,
        size: row.size,
        label: variant ? `${model} (${variant})` : model,
        count: 0,
        byok_count: 0,
        total_input_tokens: 0,
        total_input_image_tokens: 0,
        total_output_tokens: 0,
        total_images: 0,
        estimated_cost_usd: 0,
        avg_cost_usd: 0,
        credits: 0,
        charged_count: 0,
        avg_credits: 0,
      })
    }
    const stat = map.get(key)!
    stat.count++
    if (row.is_byok) stat.byok_count++
    else stat.charged_count++
    stat.total_input_tokens       += row.input_tokens       ?? 0
    stat.total_input_image_tokens += row.input_image_tokens ?? 0
    stat.total_output_tokens      += row.output_tokens      ?? 0
    stat.total_images             += row.image_count        ?? 0
    stat.estimated_cost_usd       += (row.estimated_cost_usd_cents ?? 0) / 100
    stat.credits                  += row.delta < 0 ? -row.delta : 0
  }
  const stats = [...map.values()]
  for (const s of stats) {
    s.avg_cost_usd = s.count ? s.estimated_cost_usd / s.count : 0
    s.avg_credits  = s.charged_count ? s.credits / s.charged_count : 0
  }
return stats.sort((a, b) => b.count - a.count)
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

  /** Credits actually spent across all generations (−delta; BYOK = 0). */
  const totalCreditsSpent = computed(() =>
    rows.value.reduce((acc, r) => acc + (r.delta < 0 ? -r.delta : 0), 0),
  )

  const modelStats = computed((): ModelStat[] => aggregateModelStats(rows.value))

  /**
   * Variant rows folded back to one entry per model, for callers that ask "what
   * has this configured model cost us in total" — a sum is meaningful across
   * variants in a way a mean is not.
   */
  const modelTotals = computed(() => {
    const map = new Map<string, { model: string; count: number; estimated_cost_usd: number; credits: number }>()
    for (const stat of modelStats.value) {
      const entry = map.get(stat.model) ?? { model: stat.model, count: 0, estimated_cost_usd: 0, credits: 0 }
      entry.count += stat.count
      entry.estimated_cost_usd += stat.estimated_cost_usd
      entry.credits += stat.credits
      map.set(stat.model, entry)
    }
    return map
  })

  return {
    isPending: query.isPending,
    isError:   query.isError,
    totalGenerations,
    byokCount,
    totalEstimatedCostUsd,
    totalCreditsSpent,
    modelStats,
    modelTotals,
    refetch: query.refetch,
  }
}
