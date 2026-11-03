import { computed } from "vue";
import { useQuery, useMutation, useQueryClient } from "@tanstack/vue-query";
import { storeToRefs } from "pinia";
import { supabase } from "@/lib/supabase";
import { useCampaignStore } from "@/stores/campaign";
import { useAuthStore } from "@/stores/auth";
import type {
  SoundboardPad,
  SoundboardPadInsert,
  SoundboardPadTake,
  SoundboardPadUpdate,
  SoundboardPadWithTakes,
} from "@/types/sound.types";

const QUERY_KEY = "soundboard_pads";

// ── Supabase helpers ──────────────────────────────────────────────────────

async function fetchPads(campaignId: string): Promise<SoundboardPadWithTakes[]> {
  const { data, error } = await supabase
    .from("soundboard_pads")
    .select("*, takes:soundboard_pad_takes(*)")
    .eq("campaign_id", campaignId);
  if (error) throw error;
  const pads = data as SoundboardPadWithTakes[];
  return pads.map((pad) => ({ ...pad, takes: [...pad.takes].sort((a, b) => a.position - b.position) }));
}

async function createPad(
  pad: SoundboardPadInsert & { user_id: string },
  soundIds: readonly string[],
): Promise<SoundboardPad> {
  // The id is minted here so the takes can name their pad without a second read.
  const id = crypto.randomUUID();
  const { data, error } = await supabase
    .from("soundboard_pads")
    .insert({ ...pad, id })
    .select()
    .single();
  if (error) throw error;
  if (soundIds.length > 0) {
    const takes = soundIds.map((sound_id, position) => ({ pad_id: id, sound_id, position }));
    const { error: takesError } = await supabase.from("soundboard_pad_takes").insert(takes);
    if (takesError) throw takesError;
  }
  return data as SoundboardPad;
}

async function updatePad(id: string, patch: SoundboardPadUpdate): Promise<SoundboardPad> {
  const { data, error } = await supabase.from("soundboard_pads").update(patch).eq("id", id).select().single();
  if (error) throw error;
  return data as SoundboardPad;
}

async function deletePad(id: string): Promise<void> {
  const { error } = await supabase.from("soundboard_pads").delete().eq("id", id);
  if (error) throw error;
}

async function movePad(args: { padId: string; pageId: string; lane: number; row: number }): Promise<void> {
  const { error } = await supabase.rpc("move_soundboard_pad", {
    p_pad_id: args.padId,
    p_page_id: args.pageId,
    p_lane: args.lane,
    p_row: args.row,
  });
  if (error) throw error;
}

async function addTake(padId: string, soundId: string): Promise<SoundboardPadTake> {
  const { data: last, error: readError } = await supabase
    .from("soundboard_pad_takes")
    .select("position")
    .eq("pad_id", padId)
    .order("position", { ascending: false })
    .limit(1);
  if (readError) throw readError;
  const top = (last as Array<{ position: number }>)[0];
  const position = top ? top.position + 1 : 0;
  const { data, error } = await supabase
    .from("soundboard_pad_takes")
    .insert({ pad_id: padId, sound_id: soundId, position })
    .select()
    .single();
  if (error) throw error;
  return data as SoundboardPadTake;
}

async function removeTake(takeId: string): Promise<void> {
  const { error } = await supabase.from("soundboard_pad_takes").delete().eq("id", takeId);
  if (error) throw error;
}

async function reorderTakes(padId: string, takeIds: readonly string[]): Promise<void> {
  for (const [position, takeId] of takeIds.entries()) {
    // The pad filter keeps a stray id from another pad out of this write.
    const { error } = await supabase
      .from("soundboard_pad_takes")
      .update({ position })
      .eq("id", takeId)
      .eq("pad_id", padId);
    if (error) throw error;
  }
}

// ── Hooks ─────────────────────────────────────────────────────────────────

export function useDeckPads() {
  const { activeCampaignId } = storeToRefs(useCampaignStore());

  return useQuery({
    queryKey: computed(() => [QUERY_KEY, activeCampaignId.value] as const),
    queryFn: ({ queryKey: [, campaignId] }) => {
      if (campaignId === null) throw new Error("useDeckPads fetched without a campaign");
      return fetchPads(campaignId);
    },
    enabled: () => !!activeCampaignId.value,
  });
}

function usePadMutation<TVars, TResult>(fn: (vars: TVars) => Promise<TResult>) {
  const qc = useQueryClient();
  const { activeCampaignId } = storeToRefs(useCampaignStore());
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [QUERY_KEY, activeCampaignId.value] });
    },
  });
}

export function useCreatePad() {
  const { activeCampaignId } = storeToRefs(useCampaignStore());
  const auth = useAuthStore();
  return usePadMutation(
    (vars: { pad: Omit<SoundboardPadInsert, "campaign_id">; soundIds?: string[] }) => {
      const campaignId = activeCampaignId.value;
      if (campaignId === null) throw new Error("useCreatePad without a campaign");
      if (!auth.user) throw new Error("useCreatePad without a user");
      return createPad({ ...vars.pad, campaign_id: campaignId, user_id: auth.user.id }, vars.soundIds ?? []);
    },
  );
}

export function useUpdatePad() {
  return usePadMutation(({ id, patch }: { id: string; patch: SoundboardPadUpdate }) => updatePad(id, patch));
}

export function useDeletePad() {
  return usePadMutation((id: string) => deletePad(id));
}

export function useMovePad() {
  return usePadMutation(movePad);
}

export function useAddTake() {
  return usePadMutation(({ padId, soundId }: { padId: string; soundId: string }) => addTake(padId, soundId));
}

export function useRemoveTake() {
  return usePadMutation((takeId: string) => removeTake(takeId));
}

export function useReorderTakes() {
  return usePadMutation(({ padId, takeIds }: { padId: string; takeIds: string[] }) => reorderTakes(padId, takeIds));
}
