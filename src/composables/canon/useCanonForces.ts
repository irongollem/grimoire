import type { AiProvenance } from "@/ai/provenance";
import { computed } from "vue";
import { useMutation, useQuery, useQueryClient } from "@tanstack/vue-query";
import { getCurrentUser, supabase } from "@/lib/supabase";
import { useCampaignStore } from "@/stores/campaign";
import { toast } from "@/lib/toast";
import { CANON_KEY } from "@/lib/campaignLiveSync/registry";
import { useCampaignSession } from "@/composables/campaign/useCampaignSession";
import { useCreateCanonEntry, type NewCanonEntry } from "@/composables/canon/useCanonEntries";
import { createEntryQuests, fetchCanonEntryQuests } from "@/composables/canon/useCanonEntryQuests";
import { useCreateConnection, type NamedRef } from "@/composables/connections/useConnections";
import { typeChoices } from "@/lib/worldLinks/connections";
import type { Campaign } from "@/types/campaign.types";
import type { CanonEntryQuest, CanonForceStep, CanonForceTick } from "@/types/canon.types";
import type { ForceSuggestion } from "@/ai/useCanonSuggestions";

/**
 * What is moving (#1226 story 4): a force's steps, the ticks of its clock and every quest link of the campaign (a force's
 * are the ones where the party meets it; the other parts' are read by their own blocks). The three are read together, once for the whole campaign, and every write rings the doorbell.
 */

export interface CanonForceData {
  steps: CanonForceStep[];
  ticks: CanonForceTick[];
  quests: CanonEntryQuest[];
}

/** The tick Undo may take back: the newest one. An older tick stays, so the log never reads as a clock that skipped. */
export function newestTick<T extends Pick<CanonForceTick, "id" | "created_at">>(ticks: readonly T[]): T | null {
  let newest: T | null = null;
  for (const t of ticks) if (newest === null || t.created_at >= newest.created_at) newest = t;
  return newest;
}

/** The step the force has reached: the reached step furthest along. Null when none is. */
export function stepReached(steps: readonly CanonForceStep[]): CanonForceStep | null {
  let now: CanonForceStep | null = null;
  for (const s of steps) if (s.reached_at !== null && (now === null || s.sort_order >= now.sort_order)) now = s;
  return now;
}

/** Done steps the force has passed, Now the one it has reached, Next what has not happened. */
export type StepState = "done" | "now" | "next";

export function stepState(step: CanonForceStep, now: CanonForceStep | null): StepState {
  if (step.reached_at === null) return "next";
  return step.id === now?.id ? "now" : "done";
}

/**
 * The patch a Reached tick writes. Reaching stamps the time and the session that is running (none when the DM has not
 * started one); unreaching clears both, because a reached session with no reached time is refused by the table.
 */
export function reachPatch(reached: boolean, sessionId: string | null, now: Date = new Date()): { reached_at: string | null; reached_session_id: string | null } {
  return reached ? { reached_at: now.toISOString(), reached_session_id: sessionId } : { reached_at: null, reached_session_id: null };
}

/** What a tick records beyond the move itself: the open session, and the world's date when the campaign keeps a calendar. */
export function tickContext(campaign: Pick<Campaign, "calendar_id" | "current_year" | "current_month" | "current_day"> | null, sessionId: string | null) {
  const dated = campaign !== null && campaign.calendar_id !== null;
  return {
    session_id: sessionId,
    world_year: dated ? campaign.current_year : null,
    world_month: dated ? campaign.current_month : null,
    world_day: dated ? campaign.current_day : null,
  };
}

/** The sort orders a move up or down changes, renumbered from zero so ties never leave a step stuck. Empty when it cannot move. */
export function moveStep(steps: readonly CanonForceStep[], id: string, direction: -1 | 1): { id: string; sort_order: number }[] {
  const ordered = [...steps].sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at));
  const from = ordered.findIndex((s) => s.id === id);
  const to = from + direction;
  if (from < 0 || to < 0 || to >= ordered.length) return [];
  const moved = ordered[from];
  ordered[from] = ordered[to];
  ordered[to] = moved;
  return ordered.flatMap((s, index) => (s.sort_order === index ? [] : [{ id: s.id, sort_order: index }]));
}

// ── Reads and writes ─────────────────────────────────────────────────────────

/** The campaign's steps, ticks and quest links, each scoped in its own query: RLS only bounds who may read. */
export async function fetchCanonForceData(campaignId: string): Promise<CanonForceData> {
  const [steps, ticks, quests] = await Promise.all([
    supabase.from("canon_force_steps").select("*").eq("campaign_id", campaignId).order("sort_order", { ascending: true }).order("created_at", { ascending: true }),
    supabase.from("canon_force_ticks").select("*").eq("campaign_id", campaignId).order("created_at", { ascending: true }),
    fetchCanonEntryQuests(campaignId),
  ]);
  if (steps.error) throw steps.error;
  if (ticks.error) throw ticks.error;
  return { steps: steps.data as CanonForceStep[], ticks: ticks.data as CanonForceTick[], quests };
}

function signedInUser() {
  const user = getCurrentUser();
  if (!user) throw new Error("Not authenticated");
  return user;
}

export interface NewForceStep {
  campaign_id: string;
  force_id: string;
  title: string;
  sort_order: number;
  ai_provenance?: AiProvenance | null;
}

export async function createForceSteps(inputs: readonly NewForceStep[]): Promise<void> {
  if (inputs.length === 0) return;
  const user = signedInUser();
  const { error } = await supabase.from("canon_force_steps").insert(inputs.map((i) => ({ ...i, user_id: user.id })));
  if (error) throw error;
}

export type ForceStepPatch = Partial<Pick<CanonForceStep, "title" | "sort_order" | "reached_at" | "reached_session_id">>;

export async function updateForceStep(id: string, patch: ForceStepPatch): Promise<void> {
  // RLS answers a write it refuses with no error and no row; asking for the row back is how that is told from a save.
  const { data, error } = await supabase.from("canon_force_steps").update(patch).eq("id", id).select("id");
  if (error) throw error;
  if (data.length === 0) throw new Error("That step is gone, or you may not change it.");
}

export async function deleteForceStep(id: string): Promise<void> {
  const { error } = await supabase.from("canon_force_steps").delete().eq("id", id);
  if (error) throw error;
}

export interface NewForceTick {
  campaign_id: string;
  force_id: string;
  delta: number;
  note: string;
  session_id: string | null;
  /** Set on the tick that reached a step, so undoing either takes the other back. */
  step_id?: string | null;
  world_year: number | null;
  world_month: number | null;
  world_day: number | null;
}

export async function createForceTick(input: NewForceTick): Promise<void> {
  const { error } = await supabase.from("canon_force_ticks").insert({ ...input, user_id: signedInUser().id });
  if (error) throw error;
}

export async function deleteForceTick(id: string): Promise<void> {
  const { error } = await supabase.from("canon_force_ticks").delete().eq("id", id);
  if (error) throw error;
}

export async function deleteTicksOfStep(stepId: string): Promise<void> {
  const { error } = await supabase.from("canon_force_ticks").delete().eq("step_id", stepId);
  if (error) throw error;
}

/**
 * Reaching a step stamps it and writes the tick that says so (carrying `step_id`). Unreaching clears the stamp and then
 * deletes that tick, so the clock never counts a step that is no longer reached; the tick goes last, so a failed step
 * write loses nothing.
 */
export async function reachForceStep(step: CanonForceStep, reached: boolean, ctx: ReturnType<typeof tickContext>, now: Date = new Date()): Promise<void> {
  await updateForceStep(step.id, reachPatch(reached, ctx.session_id, now));
  if (reached) await createForceTick({ campaign_id: step.campaign_id, force_id: step.force_id, delta: 1, note: `Reached: ${step.title}`, step_id: step.id, ...ctx });
  else await deleteTicksOfStep(step.id);
}

/** Undo a tick. One that reached a step takes the step back with it: the step is unreached first, then the tick deleted. */
export async function undoForceTick(tick: Pick<CanonForceTick, "id" | "step_id">): Promise<void> {
  if (tick.step_id !== null) await updateForceStep(tick.step_id, reachPatch(false, null));
  await deleteForceTick(tick.id);
}

// ── Hooks ────────────────────────────────────────────────────────────────────

/** Every force's steps, ticks and quests for the active campaign. Refreshed by the doorbell. */
export function useCanonForceData() {
  const campaign = useCampaignStore();
  const campaignId = computed(() => campaign.activeCampaignId);
  return useQuery({
    queryKey: computed(() => [CANON_KEY, "forces", campaignId.value] as const),
    queryFn: ({ queryKey: [, , cid] }) => {
      if (cid === null) throw new Error("useCanonForceData fetched without a campaign");
      return fetchCanonForceData(cid);
    },
    enabled: computed(() => !!campaignId.value),
  });
}

/** One write on the force tables: it refreshes the canon and tells the DM when it fails. */
function useForceWrite<A>(write: (arg: A) => Promise<void>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: write,
    onSuccess: () => qc.invalidateQueries({ queryKey: [CANON_KEY] }),
    onError: (e) => toast.error(toast.fromError(e)),
  });
}

export const useCreateForceSteps = () => useForceWrite(createForceSteps);
export const useUpdateForceStep = () => useForceWrite(({ id, patch }: { id: string; patch: ForceStepPatch }) => updateForceStep(id, patch));
export const useDeleteForceStep = () => useForceWrite(deleteForceStep);
export const useUndoForceTick = () => useForceWrite(undoForceTick);

/** Move a step up or down: every step whose place changed is written. */
export function useMoveForceStep() {
  return useForceWrite(async ({ steps, id, direction }: { steps: readonly CanonForceStep[]; id: string; direction: -1 | 1 }) => {
    await Promise.all(moveStep(steps, id, direction).map((c) => updateForceStep(c.id, { sort_order: c.sort_order })));
  });
}

/** The campaign's date and the open session, read the way a tick records them. */
function useTickContext() {
  const campaign = useCampaignStore();
  const { session } = useCampaignSession();
  return () => tickContext(campaign.activeCampaign, session.value?.id ?? null);
}

/** Tick a force's clock forward or back by one, with an optional note. */
export function useTickForce() {
  const context = useTickContext();
  return useForceWrite(({ campaignId, forceId, delta, note }: { campaignId: string; forceId: string; delta: 1 | -1; note: string }) =>
    createForceTick({ campaign_id: campaignId, force_id: forceId, delta, note, ...context() }),
  );
}

/** The Reached tick of a step. */
export function useReachForceStep() {
  const context = useTickContext();
  return useForceWrite(({ step, reached }: { step: CanonForceStep; reached: boolean }) => reachForceStep(step, reached, context()));
}

// ── Accepting a suggested force ──────────────────────────────────────────────

export interface AcceptForceContext {
  campaignId: string;
  sortOrder: number;
  provenance: AiProvenance | null;
  createEntry: (input: NewCanonEntry) => Promise<{ id: string }>;
  /** Ties the force to the faction or person it is about. */
  connectAbout: (forceId: string, who: NamedRef, provenance: AiProvenance | null) => Promise<void>;
}

/**
 * Write an accepted force: the entry, then its steps in order, its quest links and the tie to its faction or person,
 * each stamped with the run's provenance. Nothing is written before this is called.
 */
export async function writeAcceptedForce(s: ForceSuggestion, ctx: AcceptForceContext): Promise<void> {
  const stamp = ctx.provenance ? { ai_provenance: { ...ctx.provenance } } : {};
  const created = await ctx.createEntry({ part: "force", title: s.title, wants: s.wants, clock_size: s.clockSize, sort_order: ctx.sortOrder, ...stamp });
  await createForceSteps(s.steps.map((title, index) => ({ campaign_id: ctx.campaignId, force_id: created.id, title, sort_order: index, ...stamp })));
  // A quest named twice is linked once: the table's unique index and the insert's ignore-duplicates say so.
  await createEntryQuests(s.quests.map((q) => ({ campaign_id: ctx.campaignId, entry_id: created.id, quest_id: q.id })));
  if (s.who) await ctx.connectAbout(created.id, { kind: s.who.kind, id: s.who.id, name: s.who.name }, ctx.provenance);
}

/** `writeAcceptedForce` wired to the real writers. */
export function useAcceptForce() {
  const campaign = useCampaignStore();
  const { mutateAsync: createEntry } = useCreateCanonEntry();
  const { mutateAsync: connect } = useCreateConnection();
  const qc = useQueryClient();
  return async (s: ForceSuggestion, provenance: AiProvenance | null, sortOrder: number) => {
    const campaignId = campaign.activeCampaignId;
    if (campaignId === null) throw new Error("Accepting a force without a campaign");
    try {
      await writeAcceptedForce(s, {
        campaignId,
        sortOrder,
        provenance,
        createEntry,
        connectAbout: async (forceId, who, prov) => {
          const choice = typeChoices("canon", who.kind).find((c) => c.key === "about" && c.subjectIsFrom);
          if (!choice) throw new Error(`a force cannot be about a ${who.kind}`);
          await connect({ subject: { kind: "canon", id: forceId }, other: who, choice, ...(prov ? { aiProvenance: prov } : {}) });
        },
      });
    } finally {
      await qc.invalidateQueries({ queryKey: [CANON_KEY] });
    }
  };
}
