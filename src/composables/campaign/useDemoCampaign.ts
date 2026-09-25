import { useMutation, useQuery, useQueryClient } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";
import type { Campaign } from "@/types/campaign.types";

/**
 * The demo campaign (#912): a published template every new DM can copy into
 * their own account, quota-free, and reset or remove later. The copy itself is
 * server-side (`load_demo_campaign`, migration 20260925002215) — the client only
 * asks for it and then treats the result as an ordinary campaign.
 */

/** What `get_demo_status()` reports. Never includes the template's id. */
export interface DemoStatus {
  /** A demo has been published, so the app may offer it. */
  published: boolean;
  /** The published version stamp; null when nothing is published. */
  version: string | null;
  /** The caller's own copy, if they have loaded one. */
  demo_campaign_id: string | null;
  /** The version their copy was made from. */
  loaded_version: string | null;
}

// Under the "campaigns" key on purpose: every campaign mutation invalidates
// ["campaigns"], and deleting or creating a campaign can change this answer.
export const DEMO_STATUS_QUERY_KEY = ["campaigns", "demo-status"] as const;

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

export function isDemoStatus(value: unknown): value is DemoStatus {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.published === "boolean" &&
    isNullableString(v.version) &&
    isNullableString(v.demo_campaign_id) &&
    isNullableString(v.loaded_version)
  );
}

/** The user's copy predates the currently published template. */
export function isDemoOutdated(status: DemoStatus): boolean {
  return status.published && status.loaded_version !== null && status.version !== status.loaded_version;
}

async function fetchDemoStatus(): Promise<DemoStatus> {
  const { data, error } = await supabase.rpc("get_demo_status");
  if (error) throw error;
  if (!isDemoStatus(data)) throw new Error("get_demo_status returned an unexpected shape");
  return data;
}

async function loadDemoCampaign(replace: boolean): Promise<Campaign> {
  const { data: id, error } = await supabase.rpc("load_demo_campaign", { p_replace: replace });
  if (error) throw error;
  if (typeof id !== "string") throw new Error("load_demo_campaign returned no campaign id");
  const { data, error: fetchError } = await supabase.from("campaigns").select("*").eq("id", id).single();
  if (fetchError) throw fetchError;
  return data as Campaign;
}

export function useDemoStatus() {
  return useQuery({
    queryKey: DEMO_STATUS_QUERY_KEY,
    queryFn: fetchDemoStatus,
    staleTime: 5 * 60_000,
  });
}

/** Copies the published demo into the caller's account and returns the new campaign. */
export function useLoadDemoCampaign() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => loadDemoCampaign(false),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["campaigns"] }),
  });
}

/**
 * Replaces the caller's demo with a fresh copy of the published one. Every
 * entity query is invalidated, not just campaigns: the old demo's NPCs, quests
 * and places are gone and the new ones have new ids.
 */
export function useResetDemoCampaign() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => loadDemoCampaign(true),
    onSuccess: () => queryClient.invalidateQueries(),
  });
}

/** Admin only: makes one of the admin's own campaigns the demo and stamps a new version. */
export function usePublishDemoVersion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (campaignId: string): Promise<string> => {
      const { data, error } = await supabase.rpc("publish_demo_version", { p_campaign_id: campaignId });
      if (error) throw error;
      if (typeof data !== "string") throw new Error("publish_demo_version returned no version");
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["campaigns"] }),
  });
}
