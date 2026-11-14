import { computed, ref, watch, type Ref } from "vue";
import { useConfirm } from "@/composables/useConfirm";
import { useAllLocations } from "@/composables/locations/useLocations";
import {
  useDeleteQuestBeatEdge,
  useQuestBeatEdgeGates,
  useQuestBeatEdges,
  useQuestBeats,
  useQuestConsequences,
  useSetQuestRouteGate,
  useUpdateQuestBeatEdge,
} from "@/composables/quests/useQuestFlow";
import { useQuestObjectives } from "@/composables/quests/useQuests";
import { draftRouteGate, validateGateDrafts, type GateConditionDraft } from "@/lib/quests/gates";
import type { QuestBeatStaging } from "@/lib/quests/presentation";
import type { QuestGateMode, QuestRouteEffect, QuestRouteKind } from "@/types/quest.types";

/**
 * The selected route's editable draft, its save and its delete (#1194). The
 * route column owns this itself so the story flow does not have to carry it.
 */
export function useRouteDraft(questId: Ref<string>, edgeId: Ref<string>) {
  const { confirm } = useConfirm();
  const beatsQuery = useQuestBeats(questId);
  const edgesQuery = useQuestBeatEdges(questId);
  const gatesQuery = useQuestBeatEdgeGates(questId);
  const objectivesQuery = useQuestObjectives(questId);
  const consequencesQuery = useQuestConsequences(questId);
  const locationsQuery = useAllLocations();
  const updateEdge = useUpdateQuestBeatEdge();
  const deleteEdge = useDeleteQuestBeatEdge();
  const setRouteGate = useSetQuestRouteGate();

  const beats = computed(() => beatsQuery.data.value ?? []);
  const edges = computed(() => edgesQuery.data.value ?? []);
  const gates = computed(() => gatesQuery.data.value ?? []);
  const objectives = computed(() => objectivesQuery.data.value ?? []);
  const edge = computed(() => edges.value.find((candidate) => candidate.id === edgeId.value) ?? null);

  const label = ref("");
  const note = ref("");
  const kind = ref<QuestRouteKind>("choice");
  const gateMode = ref<QuestGateMode>("all");
  const conditions = ref<GateConditionDraft[]>([]);
  const saving = ref(false);
  const error = ref("");

  function storedConditions(id: string): GateConditionDraft[] {
    return gates.value.filter((gate) => gate.edge_id === id).map((gate) => ({ key: gate.id, gateId: gate.id, objectiveId: gate.objective_id, statuses: [...gate.statuses] }));
  }
  function seed() {
    const current = edge.value;
    label.value = current?.label ?? "";
    note.value = current?.note ?? "";
    kind.value = current?.route_kind ?? "choice";
    gateMode.value = current?.gate_mode ?? "all";
    conditions.value = current ? storedConditions(current.id) : [];
    error.value = "";
  }
  // Seeded by which route is selected, not by the route row: a save refetches
  // the row, and re-seeding from that echo would eat what is typed next.
  // Gates arrive in their own query, so a route selected before they load
  // seeds once more when they do (and only then).
  let seededFor: string | null = null;
  let gatesSeeded = false;
  watch([() => edge.value?.id, () => gatesQuery.isSuccess.value], ([id, gatesReady]) => {
    if (!id) { seededFor = null; gatesSeeded = false; return; }
    if (id !== seededFor) { seededFor = id; gatesSeeded = gatesReady; seed(); return; }
    if (gatesReady && !gatesSeeded) { gatesSeeded = true; conditions.value = storedConditions(id); }
  }, { immediate: true });

  const sourceTitle = computed(() => beats.value.find((beat) => beat.id === edge.value?.source_beat_id)?.title || "Missing beat");
  const targetTitle = computed(() => beats.value.find((beat) => beat.id === edge.value?.target_beat_id)?.title || "Missing beat");
  const objectiveOptions = computed(() => objectives.value.map((objective) => ({ id: objective.id, name: objective.description })));
  const gatePreview = computed(() => draftRouteGate(conditions.value, gateMode.value, objectives.value));

  const effects = computed<QuestRouteEffect[]>(() => {
    const current = edge.value;
    if (!current) return [];
    const descriptions = new Map(objectives.value.map((objective) => [objective.id, objective.description]));
    return (consequencesQuery.data.value ?? [])
      .filter((consequence) => consequence.on_edge_id === current.id)
      .map((consequence) => ({
        action: consequence.action,
        objective: consequence.target_objective_id ? descriptions.get(consequence.target_objective_id) ?? null : null,
        after_days: consequence.after_days,
      }));
  });

  // Switching a route to parallel is only safe when the beat it leaves keeps
  // somewhere else to send the cursor (the composer enforces the same).
  const canBeParallel = computed(() => {
    const current = edge.value;
    if (!current) return false;
    if (current.route_kind === "parallel") return true;
    return edges.value.some((candidate) => candidate.id !== current.id && candidate.source_beat_id === current.source_beat_id && candidate.route_kind === "choice");
  });

  const targetStaging = computed<QuestBeatStaging | null>(() => {
    const stagedId = beats.value.find((beat) => beat.id === edge.value?.target_beat_id)?.staged_at_location_id;
    if (!stagedId) return null;
    const staged = (locationsQuery.data.value ?? []).find((candidate) => candidate.id === stagedId);
    return staged ? { locationId: staged.id, name: staged.name, siteId: null, siteName: null } : null;
  });

  async function save(): Promise<boolean> {
    const current = edge.value;
    if (!current) return false;
    const problem = validateGateDrafts(conditions.value);
    const trimmed = label.value.trim();
    if (problem) { error.value = problem; return false; }
    if (kind.value === "parallel" && !trimmed) { error.value = "An \"and also\" route needs what the party does: it names the thread it opens."; return false; }
    if (kind.value === "parallel" && !canBeParallel.value) { error.value = "This beat has no other choice route. Making this one \"and also\" would leave its thread nowhere to go."; return false; }
    // Captured before any await: the refetch after the update must not be read back into the draft.
    const mode = gateMode.value;
    const gateConditions = conditions.value.map((draft) => ({ objectiveId: draft.objectiveId, statuses: [...draft.statuses] }));
    saving.value = true;
    error.value = "";
    try {
      await updateEdge.mutateAsync({ id: current.id, questId: questId.value, update: { route_kind: kind.value, label: trimmed || null, note: note.value.trim() || null } });
      await setRouteGate.mutateAsync({ edgeId: current.id, questId: questId.value, mode, conditions: gateConditions });
      // Re-read the stored gates so a condition just added is an update next time, not a second insert.
      await gatesQuery.refetch();
      conditions.value = storedConditions(current.id);
      return true;
    } catch (e) {
      error.value = e instanceof Error ? e.message : "Could not save route";
      return false;
    } finally { saving.value = false; }
  }

  /** True once the route is gone: only then may the caller clear its selection. */
  async function remove(): Promise<boolean> {
    const current = edge.value;
    if (!current || !(await confirm(`Delete this route to “${targetTitle.value}”?`))) return false;
    try {
      error.value = "";
      await deleteEdge.mutateAsync({ id: current.id, questId: questId.value });
      return true;
    } catch (e) {
      error.value = e instanceof Error ? e.message : "Could not delete route";
      return false;
    }
  }

  return { edge, edges, beats, label, note, kind, gateMode, conditions, saving, error, sourceTitle, targetTitle, objectiveOptions, gatePreview, effects, canBeParallel, targetStaging, save, remove };
}
