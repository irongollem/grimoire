import { useQuery, useMutation, useQueryClient } from "@tanstack/vue-query";
import { supabase, getCurrentUser } from "@/lib/supabase";
import type { SrdRule, Rule, RuleInsert, RuleUpdate } from "@/types/rule.types";

// ── SRD Rules ─────────────────────────────────────────────────────────────────

const SRD_KEY = "srd_rules";

async function fetchSrdRules(): Promise<SrdRule[]> {
  const { data, error } = await supabase
    .from("srd_rules")
    .select("*")
    .order("name", { ascending: true });
  if (error) throw error;
  return data as SrdRule[];
}

export function useSrdRules() {
  return useQuery({
    queryKey: [SRD_KEY],
    queryFn: fetchSrdRules,
    staleTime: 1000 * 60 * 60, // 1 hour — content rarely changes
  });
}

// ── Custom Rules ──────────────────────────────────────────────────────────────

const CUSTOM_KEY = "rules";

async function fetchRules(): Promise<Rule[]> {
  const { data, error } = await supabase
    .from("rules")
    .select("*")
    .order("title", { ascending: true });
  if (error) throw error;
  return data as Rule[];
}

async function fetchRule(id: string): Promise<Rule> {
  const { data, error } = await supabase.from("rules").select("*").eq("id", id).single();
  if (error) throw error;
  return data as Rule;
}

async function createRule(rule: RuleInsert): Promise<Rule> {
  const user = getCurrentUser();
  const { data, error } = await supabase
    .from("rules")
    .insert({ ...rule, user_id: user!.id })
    .select()
    .single();
  if (error) throw error;
  return data as Rule;
}

async function updateRule(id: string, update: RuleUpdate): Promise<Rule> {
  const { data, error } = await supabase
    .from("rules")
    .update(update)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data as Rule;
}

async function deleteRule(id: string): Promise<void> {
  const { error } = await supabase.from("rules").delete().eq("id", id);
  if (error) throw error;
}

export function useRules() {
  return useQuery({ queryKey: [CUSTOM_KEY], queryFn: fetchRules, staleTime: Infinity });
}

export function useRule(id: string) {
  return useQuery({
    queryKey: [CUSTOM_KEY, id],
    queryFn: () => fetchRule(id),
    enabled: !!id,
  });
}

export function useCreateRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createRule,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [CUSTOM_KEY] }),
  });
}

export function useUpdateRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, update }: { id: string; update: RuleUpdate }) => updateRule(id, update),
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: [CUSTOM_KEY] });
      queryClient.invalidateQueries({ queryKey: [CUSTOM_KEY, id] });
    },
  });
}

export function useDeleteRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteRule,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [CUSTOM_KEY] }),
  });
}
