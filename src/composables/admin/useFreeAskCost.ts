import { computed } from "vue";
import { useQuery } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";

// What the Familiar's free answers cost the platform (maintainer, 25 Nov 2026: "monitor it properly so we can't get
// shell shocked"). The first five answers a day are free whatever the conversation's size; each is still written to
// the ledger at no charge with its tokens (`ledger.free("ask_answer")`), and `ai_generation_costs` prices that row. A
// turn is capped (40,000 tokens, 6 steps), so the worst case is bounded, but nobody was looking at the total.

/** How far back the panel reads. */
export const FREE_ASK_DAYS = 30;

export interface FreeAskRow {
  created_at: string;
  /** A numeric column: it can arrive as a string, so it is read through Number. */
  estimated_cost_usd_cents: number | string | null;
  input_tokens: number | null;
}

export interface FreeAskDay {
  /** The UTC day, `YYYY-MM-DD`, as the allowance counts days. */
  day: string;
  answers: number;
  usd: number;
}

export interface FreeAskSummary {
  days: FreeAskDay[];
  totalUsd: number;
  answers: number;
  /** The single dearest free answer: the long-conversation case. Null when there is none. */
  dearest: { usd: number; inputTokens: number; at: string } | null;
  /** The last seven days' cost run on for thirty, in USD. */
  monthlyProjectionUsd: number;
}

/**
 * Folds the free answers into days (newest first, every day of the window present, empty ones at zero), the total,
 * the dearest answer and a projection. Pure, so the folding is tested without a database.
 */
export function summarizeFreeAsks(rows: readonly FreeAskRow[], now: Date, days: number = FREE_ASK_DAYS): FreeAskSummary {
  const byDay = new Map<string, FreeAskDay>();
  for (let i = 0; i < days; i++) {
    const day = new Date(now.getTime() - i * 86_400_000).toISOString().slice(0, 10);
    byDay.set(day, { day, answers: 0, usd: 0 });
  }
  let dearest: FreeAskSummary["dearest"] = null;
  let totalUsd = 0;
  let answers = 0;
  let lastWeekUsd = 0;
  const weekAgo = now.getTime() - 7 * 86_400_000;
  for (const row of rows) {
    const cents = row.estimated_cost_usd_cents === null ? 0 : Number(row.estimated_cost_usd_cents);
    const usd = (Number.isFinite(cents) ? cents : 0) / 100;
    const entry = byDay.get(row.created_at.slice(0, 10));
    if (entry === undefined) continue;
    entry.answers += 1;
    entry.usd += usd;
    totalUsd += usd;
    answers += 1;
    if (new Date(row.created_at).getTime() >= weekAgo) lastWeekUsd += usd;
    if (dearest === null || usd > dearest.usd) dearest = { usd, inputTokens: row.input_tokens ?? 0, at: row.created_at };
  }
  return { days: [...byDay.values()], totalUsd, answers, dearest, monthlyProjectionUsd: (lastWeekUsd / 7) * 30 };
}

export function useFreeAskCost() {
  const query = useQuery({
    queryKey: ["admin", "free-ask-cost"],
    queryFn: async (): Promise<FreeAskRow[]> => {
      const since = new Date(Date.now() - FREE_ASK_DAYS * 86_400_000).toISOString();
      // A free answer is an `ask_answer` row that moved no credits.
      const { data, error } = await supabase
        .from("ai_generation_costs")
        .select("created_at, estimated_cost_usd_cents, input_tokens")
        .eq("reason", "ask_answer")
        .eq("delta", 0)
        .gte("created_at", since);
      if (error) throw error;
      return (data ?? []) as FreeAskRow[];
    },
    staleTime: 5 * 60_000,
  });
  const summary = computed(() => (query.data.value ? summarizeFreeAsks(query.data.value, new Date()) : null));
  return { query, summary };
}
