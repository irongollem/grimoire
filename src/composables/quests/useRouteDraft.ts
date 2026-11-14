import { computed, reactive, ref, watch, type Ref } from "vue";
import { useAutosave } from "@/composables/useAutosave";
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

interface RouteDraft {
  label: string;
  note: string;
  kind: QuestRouteKind;
  gateMode: QuestGateMode;
  conditions: GateConditionDraft[];
}
const emptyDraft = (): RouteDraft => ({ label: "", note: "", kind: "choice", gateMode: "all", conditions: [] });
// A condition's `key` is bookkeeping for the editor rows, not content.
const routeDraftsEqual = (a: RouteDraft, b: RouteDraft) => a.label === b.label && a.note === b.note && a.kind === b.kind && a.gateMode === b.gateMode
  && JSON.stringify(a.conditions.map((c) => [c.objectiveId, c.statuses])) === JSON.stringify(b.conditions.map((c) => [c.objectiveId, c.statuses]));

/**
 * The selected route's editable draft, its save and its delete (#1194). The
 * route column owns this itself (autosaving, like the beat form) so the story flow does not have to carry it.
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

  const draft = reactive<RouteDraft>(emptyDraft());
  // The route the draft belongs to. It trails `edgeId` for the moment it takes
  // to flush a pending edit when another route is selected, so that save still
  // lands on the route it was typed into.
  const draftEdgeId = ref<string | null>(null);
  const deleteError = ref("");

  function storedConditions(id: string): GateConditionDraft[] {
    return gates.value.filter((gate) => gate.edge_id === id).map((gate) => ({ key: gate.id, gateId: gate.id, objectiveId: gate.objective_id, statuses: [...gate.statuses] }));
  }
  function seedFor(id: string | null): RouteDraft {
    const row = id ? edges.value.find((candidate) => candidate.id === id) : null;
    if (!id || !row) return emptyDraft();
    return { label: row.label ?? "", note: row.note ?? "", kind: row.route_kind, gateMode: row.gate_mode, conditions: storedConditions(id) };
  }

  // Switching a route to parallel is only safe when the beat it leaves keeps
  // somewhere else to send the cursor (the composer enforces the same).
  function canBeParallelFor(id: string | null): boolean {
    const row = id ? edges.value.find((candidate) => candidate.id === id) : null;
    if (!row) return false;
    if (row.route_kind === "parallel") return true;
    return edges.value.some((candidate) => candidate.id !== row.id && candidate.source_beat_id === row.source_beat_id && candidate.route_kind === "choice");
  }

  /** Why autosave is holding back, as the end of "Autosave paused until ...". Null when it may write. */
  const pausedReason = computed<string | null>(() => {
    if (!draftEdgeId.value) return "a route is selected";
    if (validateGateDrafts(draft.conditions)) return "the condition is complete";
    if (draft.kind === "parallel" && !draft.label.trim()) return "this route has a label";
    if (draft.kind === "parallel" && !canBeParallelFor(draftEdgeId.value)) return "this beat has another choice route";
    return null;
  });

  const autosave = useAutosave<RouteDraft>({
    draft,
    initial: () => seedFor(draftEdgeId.value),
    equal: routeDraftsEqual,
    canSave: () => pausedReason.value === null,
    errorMessage: "Could not save this route",
    async save(snapshot) {
      const id = draftEdgeId.value;
      if (!id) return;
      await updateEdge.mutateAsync({ id, questId: questId.value, update: { route_kind: snapshot.kind, label: snapshot.label.trim() || null, note: snapshot.note.trim() || null } });
      await setRouteGate.mutateAsync({ edgeId: id, questId: questId.value, mode: snapshot.gateMode, conditions: snapshot.conditions.map((condition) => ({ objectiveId: condition.objectiveId, statuses: [...condition.statuses] })) });
    },
  });

  // Seeded by which route is selected, never by the route row: our own save
  // refetches it, normalised (trimmed, blanks nulled), and re-seeding from that
  // would pull characters out from under the caret. A pending edit is flushed
  // to the route it was typed into before the draft moves on. Gates arrive in
  // their own query, so a route selected before they load seeds once more when
  // they do, unless the DM has already started editing.
  let gatesSeeded = false;
  watch([() => edge.value?.id ?? null, () => gatesQuery.isSuccess.value], async ([id, gatesReady]) => {
    if (id !== draftEdgeId.value) {
      // Only a pending edit needs the wait; a clean draft moves on synchronously.
      if (autosave.dirty.value) await autosave.saveNow();
      draftEdgeId.value = id;
      gatesSeeded = gatesReady;
      autosave.reset(seedFor(id));
      deleteError.value = "";
      return;
    }
    if (id && gatesReady && !gatesSeeded) {
      gatesSeeded = true;
      if (!autosave.dirty.value && !autosave.saving.value) autosave.reset(seedFor(id));
    }
  }, { immediate: true });

  const sourceTitle = computed(() => beats.value.find((beat) => beat.id === edge.value?.source_beat_id)?.title || "Missing beat");
  const targetTitle = computed(() => beats.value.find((beat) => beat.id === edge.value?.target_beat_id)?.title || "Missing beat");
  const objectiveOptions = computed(() => objectives.value.map((objective) => ({ id: objective.id, name: objective.description })));
  const gatePreview = computed(() => draftRouteGate(draft.conditions, draft.gateMode, objectives.value));

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

  const canBeParallel = computed(() => canBeParallelFor(edge.value?.id ?? null));

  const targetStaging = computed<QuestBeatStaging | null>(() => {
    const stagedId = beats.value.find((beat) => beat.id === edge.value?.target_beat_id)?.staged_at_location_id;
    if (!stagedId) return null;
    const staged = (locationsQuery.data.value ?? []).find((candidate) => candidate.id === stagedId);
    return staged ? { locationId: staged.id, name: staged.name, siteId: null, siteName: null } : null;
  });

  /** True once the route is gone: only then may the caller clear its selection. */
  async function remove(): Promise<boolean> {
    const current = edge.value;
    if (!current || !(await confirm(`Delete this route to “${targetTitle.value}”?`))) return false;
    try {
      deleteError.value = "";
      // A pending autosave must not write to the row being deleted.
      await autosave.hold();
      await deleteEdge.mutateAsync({ id: current.id, questId: questId.value });
      return true;
    } catch (e) {
      autosave.release();
      deleteError.value = e instanceof Error ? e.message : "Could not delete route";
      return false;
    }
  }

  return { edge, edges, beats, draft, deleteError, status: autosave.status, saveError: autosave.saveError, pausedReason, sourceTitle, targetTitle, objectiveOptions, gatePreview, effects, canBeParallel, targetStaging, remove };
}
