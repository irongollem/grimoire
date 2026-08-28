import { useQuery, useMutation, useQueryClient } from "@tanstack/vue-query";
import { computed, type Ref } from "vue";
import { supabase, getCurrentUser } from "@/lib/supabase";
import { useCampaignStore } from "@/stores/campaign";
import { getSetting } from "@/settings/index";
import { matchSettingRowIds, stampSettingSource } from "@/lib/populateSetting/settingContent";
import type {
  Deity, DeityInsert, DeityUpdate,
  Pantheon, PantheonInsert, PantheonUpdate,
} from "@/types/deity.types";

// ── Pantheons CRUD ─────────────────────────────────────────────────────────────

export function useAllPantheons() {
  const campaign = useCampaignStore();
  const campaignId = computed(() => campaign.activeCampaignId);
  return useQuery({
    queryKey: computed(() => ["pantheons", campaignId.value]),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pantheons")
        .select("*")
        .eq("campaign_id", campaignId.value!)
        .order("name", { ascending: true });
      if (error) throw error;
      return data as Pantheon[];
    },
    enabled: computed(() => !!campaignId.value),
  });
}

export function usePantheon(id: Ref<string>) {
  return useQuery({
    queryKey: computed(() => ["pantheons", id.value]),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pantheons")
        .select("*")
        .eq("id", id.value)
        .single();
      if (error) throw error;
      return data as Pantheon;
    },
    enabled: computed(() => !!id.value),
  });
}

export function useCreatePantheon() {
  const qc = useQueryClient();
  const campaign = useCampaignStore();
  return useMutation({
    mutationFn: async (payload: Omit<PantheonInsert, "campaign_id">) => {
      const user = getCurrentUser();
      const { data, error } = await supabase
        .from("pantheons")
        .insert({ ...payload, user_id: user!.id, campaign_id: campaign.activeCampaignId! })
        .select()
        .single();
      if (error) throw error;
      return data as Pantheon;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pantheons", campaign.activeCampaignId] }),
  });
}

export function useUpdatePantheon() {
  const qc = useQueryClient();
  const campaign = useCampaignStore();
  return useMutation({
    mutationFn: async ({ id, update }: { id: string; update: PantheonUpdate }) => {
      const { error } = await supabase.from("pantheons").update(update).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_data, { id }) => {
      qc.invalidateQueries({ queryKey: ["pantheons", campaign.activeCampaignId] });
      qc.invalidateQueries({ queryKey: ["pantheons", id] });
    },
  });
}

export function useDeletePantheon() {
  const qc = useQueryClient();
  const campaign = useCampaignStore();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("pantheons").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pantheons", campaign.activeCampaignId] });
      qc.invalidateQueries({ queryKey: ["deities", campaign.activeCampaignId] });
    },
  });
}

// ── Deities CRUD ───────────────────────────────────────────────────────────────

export function useAllDeities() {
  const campaign = useCampaignStore();
  const campaignId = computed(() => campaign.activeCampaignId);
  return useQuery({
    queryKey: computed(() => ["deities", campaignId.value]),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("deities")
        .select("*, pantheon:pantheons(id, name)")
        .eq("campaign_id", campaignId.value!)
        .order("name", { ascending: true });
      if (error) throw error;
      return data as (Deity & { pantheon: Pick<Pantheon, "id" | "name"> | null })[];
    },
    enabled: computed(() => !!campaignId.value),
  });
}

export function useDeity(id: Ref<string>) {
  return useQuery({
    queryKey: computed(() => ["deities", id.value]),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("deities")
        .select("*, pantheon:pantheons(id, name)")
        .eq("id", id.value)
        .single();
      if (error) throw error;
      return data as Deity & { pantheon: Pick<Pantheon, "id" | "name"> | null };
    },
    enabled: computed(() => !!id.value),
  });
}

export function useCreateDeity() {
  const qc = useQueryClient();
  const campaign = useCampaignStore();
  return useMutation({
    mutationFn: async (payload: Omit<DeityInsert, "campaign_id">) => {
      const user = getCurrentUser();
      const { data, error } = await supabase
        .from("deities")
        .insert({ ...payload, user_id: user!.id, campaign_id: campaign.activeCampaignId! })
        .select()
        .single();
      if (error) throw error;
      return data as Deity;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["deities", campaign.activeCampaignId] }),
  });
}

export function useUpdateDeity() {
  const qc = useQueryClient();
  const campaign = useCampaignStore();
  return useMutation({
    mutationFn: async ({ id, update }: { id: string; update: DeityUpdate }) => {
      const { error } = await supabase.from("deities").update(update).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_data, { id }) => {
      qc.invalidateQueries({ queryKey: ["deities", campaign.activeCampaignId] });
      qc.invalidateQueries({ queryKey: ["deities", id] });
    },
  });
}

export function useDeleteDeity() {
  const qc = useQueryClient();
  const campaign = useCampaignStore();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("deities").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["deities", campaign.activeCampaignId] }),
  });
}

// ── Populate from setting ──────────────────────────────────────────────────────

function toRichText(text: string): string {
  return JSON.stringify({
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text }] }],
  });
}

/** Reveal all deities and pantheons to all party members in one shot. */
export function useRevealAllDeities() {
  const qc = useQueryClient();
  const campaign = useCampaignStore();
  return useMutation({
    mutationFn: async (): Promise<void> => {
      const campaignId = campaign.activeCampaignId;
      if (!campaignId) throw new Error("No active campaign");

      const { data: members, error: mErr } = await supabase
        .from("party_members")
        .select("id")
        .eq("campaign_id", campaignId);
      if (mErr) throw mErr;

      const allIds = (members ?? []).map((m: { id: string }) => m.id);
      if (!allIds.length) return;

      const [{ error: dErr }, { error: pErr }] = await Promise.all([
        supabase.from("deities").update({ player_visible_to: allIds }).eq("campaign_id", campaignId),
        supabase.from("pantheons").update({ player_visible_to: allIds }).eq("campaign_id", campaignId),
      ]);
      if (dErr) throw dErr;
      if (pErr) throw pErr;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["deities"] });
      qc.invalidateQueries({ queryKey: ["pantheons"] });
    },
  });
}

/** Bulk-insert seed pantheons + deities for the active campaign's setting.
 *  Returns [pantheonCount, deityCount] inserted. Deduplicates by name (case-insensitive). */
export function usePopulateDeities() {
  const qc = useQueryClient();
  const campaign = useCampaignStore();
  return useMutation({
    mutationFn: async (): Promise<[number, number]> => {
      const campaignId = campaign.activeCampaignId;
      if (!campaignId) throw new Error("No active campaign");

      const { data: campaignRow, error: campaignError } = await supabase
        .from("campaigns")
        .select("calendar_id")
        .eq("id", campaignId)
        .single();
      if (campaignError) throw campaignError;

      const calendarId: string = campaignRow?.calendar_id ?? "faerun";
      const setting = getSetting(calendarId);
      if (!setting?.pantheons.length && !setting?.deities.length) return [0, 0];

      const user = getCurrentUser();

      // ── Pantheons ──────────────────────────────────────────────────────────
      const { data: existingPantheons, error: pFetchErr } = await supabase
        .from("pantheons")
        .select("id, name")
        .eq("campaign_id", campaignId);
      if (pFetchErr) throw pFetchErr;

      const existingPantheonNames = new Set(
        (existingPantheons ?? []).map((p: { name: string }) => p.name.toLowerCase()),
      );

      // Repair pass for campaigns populated before `setting_source` existed —
      // shipped rows were counting against the user's own caps. Faerûn alone is
      // 13 pantheons and 112 deities against limits of 3 and 5.
      await stampSettingSource(
        "pantheons",
        matchSettingRowIds(existingPantheons ?? [], (setting.pantheons ?? []).map((p) => p.name)),
        calendarId,
      );

      const pantheonsToInsert = (setting.pantheons ?? [])
        .filter((p) => !existingPantheonNames.has(p.name.toLowerCase()))
        .map((p) => ({
          name: p.name,
          description: p.description ? toRichText(p.description) : null,
          tags: p.tags,
          emblem_url: null,
          player_visible_to: [],
          setting_source: calendarId,
          user_id: user!.id,
          campaign_id: campaignId,
        }));

      let insertedPantheonCount = 0;
      const pantheonNameToId: Record<string, string> = {};

      // Seed existing id map first
      for (const p of existingPantheons ?? []) {
        pantheonNameToId[p.name.toLowerCase()] = p.id;
      }

      if (pantheonsToInsert.length) {
        const { data: inserted, error: pInsertErr } = await supabase
          .from("pantheons")
          .insert(pantheonsToInsert)
          .select("id, name");
        if (pInsertErr) throw pInsertErr;
        insertedPantheonCount = (inserted ?? []).length;
        for (const p of inserted ?? []) {
          pantheonNameToId[(p.name as string).toLowerCase()] = p.id as string;
        }
      }

      // ── Deities ────────────────────────────────────────────────────────────
      const { data: existingDeities, error: dFetchErr } = await supabase
        .from("deities")
        .select("id, name, pantheon_id, alternate_names")
        .eq("campaign_id", campaignId);
      if (dFetchErr) throw dFetchErr;

      type ExistingDeity = { id: string; name: string; pantheon_id: string | null; alternate_names: string[] | null };
      const existingDeityMap = new Map<string, ExistingDeity>(
        (existingDeities ?? []).map((d: ExistingDeity) => [d.name.toLowerCase(), d]),
      );

      await stampSettingSource(
        "deities",
        matchSettingRowIds(existingDeities ?? [], (setting.deities ?? []).map((d) => d.name)),
        calendarId,
      );

      const deitiesToInsert: object[] = [];
      const deitiesToPatch: { id: string; pantheon_id: string | null; alternate_names: string[] }[] = [];

      for (const d of setting.deities ?? []) {
        const key = d.name.toLowerCase();
        const seedPantheonId = d.pantheon ? (pantheonNameToId[d.pantheon.toLowerCase()] ?? null) : null;
        const existing = existingDeityMap.get(key);
        if (!existing) {
          deitiesToInsert.push({
            name: d.name,
            titles: d.titles ?? null,
            alternate_names: d.alternate_names ?? [],
            pantheon_id: seedPantheonId,
            alignment: d.alignment ?? null,
            symbol: d.symbol ?? null,
            symbol_image_url: null,
            portrait_url: null,
            portrait_focal_point: null,
            domains: d.domains,
            portfolio: d.portfolio ?? null,
            description: d.description ? toRichText(d.description) : null,
            dm_notes: null,
            tags: d.tags,
            player_visible_to: [],
            setting_source: calendarId,
            user_id: user!.id,
            campaign_id: campaignId,
          });
        } else {
          const seedAltNames = d.alternate_names ?? [];
          const needsPantheonFix = existing.pantheon_id !== seedPantheonId;
          const needsAltNamesFix =
            seedAltNames.length > 0 &&
            JSON.stringify([...(existing.alternate_names ?? [])].sort()) !==
              JSON.stringify([...seedAltNames].sort());
          if (needsPantheonFix || needsAltNamesFix) {
            deitiesToPatch.push({
              id: existing.id,
              pantheon_id: seedPantheonId,
              alternate_names: seedAltNames,
            });
          }
        }
      }

      let insertedDeityCount = 0;
      if (deitiesToInsert.length) {
        const { data: inserted, error: dInsertErr } = await supabase
          .from("deities")
          .insert(deitiesToInsert)
          .select("id");
        if (dInsertErr) throw dInsertErr;
        insertedDeityCount = (inserted ?? []).length;
      }

      let patchedDeityCount = 0;
      for (const patch of deitiesToPatch) {
        const { error: pErr } = await supabase
          .from("deities")
          .update({ pantheon_id: patch.pantheon_id, alternate_names: patch.alternate_names })
          .eq("id", patch.id);
        if (pErr) throw pErr;
        patchedDeityCount++;
      }

      return [insertedPantheonCount, insertedDeityCount + patchedDeityCount];
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pantheons"] });
      qc.invalidateQueries({ queryKey: ["deities"] });
    },
  });
}
