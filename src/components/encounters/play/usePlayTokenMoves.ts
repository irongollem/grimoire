import { computed, ref, toValue, watch, type MaybeRefOrGetter, type Ref } from "vue";
import {
  groupMove,
  moveLabel,
  planMove,
  snapAnchor,
  stepStates,
  type Cell,
  type MovePlan,
  type SpeedState,
} from "@/lib/battlemap/movement";
import type { useEncounterRunStore } from "@/stores/encounterRun";
import type { RunCombatant } from "@/types/encounter.types";
import type { PartyMember } from "@/types/party.types";
import type { PathLine } from "./PlayMovePath.vue";
import type { usePlayMapState } from "./usePlayMapState";
import { footprintOf, movementUsedOf } from "./playRoster";
import { combatantSpeed } from "./playSpeed";
import type { PlayTool } from "./playTypes";

export interface MovePreview {
  lines: PathLine[];
  text: string;
  state: SpeedState;
  labelAt: Cell & { footprint: number };
}

/**
 * Selecting and moving tokens on the Play map (#1125 decisions 10 and 11): the shared selection, the path a move
 * would take, and the move itself with its feet charged to the active token. The selection is the same one the
 * initiative list and the right column use (PlayLayout owns it); this turns it into moves. The DM is never blocked:
 * nothing here refuses a move, it only prices it.
 */
export function usePlayTokenMoves(input: {
  state: ReturnType<typeof usePlayMapState>;
  store: ReturnType<typeof useEncounterRunStore>;
  selectedId: MaybeRefOrGetter<string | null>;
  groupIds: MaybeRefOrGetter<readonly string[]>;
  partyMembers: MaybeRefOrGetter<readonly Pick<PartyMember, "id" | "speed">[]>;
  canEdit: Ref<boolean>;
  tool: Ref<PlayTool>;
  placing: MaybeRefOrGetter<boolean>;
  select: (instanceId: string | null) => void;
  selectGroup: (instanceIds: string[]) => void;
}) {
  const { state, store, canEdit, tool } = input;

  const selection = computed<ReadonlySet<string>>(() => {
    const group = toValue(input.groupIds);
    const one = toValue(input.selectedId);
    return new Set(group.length > 1 ? group : one ? [one] : []);
  });
  const placedById = (id: string) => state.placed.value.find((c) => c.instance_id === id);
  const footprintFor = (c: RunCombatant) => footprintOf(c, state.monsters.value);

  /** Everyone who moves with the leader: the group when the leader is in it, else the leader alone. */
  function moversWith(leaderId: string): RunCombatant[] {
    const ids = selection.value.has(leaderId) && selection.value.size > 1 ? [...selection.value] : [leaderId];
    return ids.flatMap((id) => {
      const c = placedById(id);
      return c?.position ? [c] : [];
    });
  }

  function onTokenSelect(instanceId: string, additive: boolean) {
    if (!additive) {
      input.selectGroup([]);
      input.select(instanceId);
      return;
    }
    const current = [...selection.value];
    const next = current.includes(instanceId) ? current.filter((id) => id !== instanceId) : [...current, instanceId];
    input.selectGroup(next.length > 1 ? next : []);
    const primary = toValue(input.selectedId);
    input.select(next.length === 0 ? null : primary !== null && next.includes(primary) ? primary : next[0]);
  }

  /** Selects whoever's middle lies inside the box (corners in image cells). The turn-taker stays primary when inside. */
  function selectBox(a: { x: number; y: number } | null, b: { x: number; y: number } | null) {
    if (!a || !b) return;
    const [x0, x1] = [Math.min(a.x, b.x), Math.max(a.x, b.x)];
    const [y0, y1] = [Math.min(a.y, b.y), Math.max(a.y, b.y)];
    const inside = state.placed.value.filter((c) => {
      const mid = footprintFor(c) / 2;
      const at = c.position;
      return at !== null && at !== undefined && at.x + mid >= x0 && at.x + mid <= x1 && at.y + mid >= y0 && at.y + mid <= y1;
    });
    if (inside.length === 0) return;
    const ids = inside.map((c) => c.instance_id);
    input.selectGroup(ids.length > 1 ? ids : []);
    const turn = state.activeInstanceId.value;
    input.select(turn !== null && ids.includes(turn) ? turn : ids[0]);
  }

  function clearSelection() {
    waypoints.value = [];
    input.selectGroup([]);
    input.select(null);
  }

  // Waypoints bend the path of the next move (Shift-click); they are the lone token's, never a group's.
  const waypoints = ref<Cell[]>([]);
  function addWaypoint(at: { x: number; y: number } | null) {
    const one = toValue(input.selectedId);
    const leader = one ? placedById(one) : undefined;
    if (!at || !leader || selection.value.size > 1) return;
    waypoints.value = [...waypoints.value, snapAnchor(at, footprintFor(leader))];
  }
  watch(
    () => toValue(input.selectedId),
    () => (waypoints.value = []),
  );

  /** The pointer's place in image cells while it hovers the map with nothing pressed. */
  const hover = ref<{ x: number; y: number } | null>(null);
  const dragPreview = ref<{ id: string; to: Cell } | null>(null);

  function onDragPreview(instanceId: string, to: Cell | null) {
    dragPreview.value = to ? { id: instanceId, to } : null;
  }

  function speedOf(c: RunCombatant): number | null {
    return combatantSpeed(c, { monsters: store.availableMonsters, npcs: store.availableNpcs, members: toValue(input.partyMembers) });
  }

  /** Feet this token has already moved this turn: only the one whose turn it is has a turn to count against. */
  function usedFeet(c: RunCombatant): number {
    if (c.instance_id !== state.activeInstanceId.value) return 0;
    return movementUsedOf(store.combatants.find((x) => x.instance_id === c.instance_id));
  }

  function planFor(c: RunCombatant, to: Cell, via: readonly Cell[]): MovePlan | null {
    return c.position ? planMove({ from: c.position, to, via, footprint: footprintFor(c), terrain: state.moveTerrain.value }) : null;
  }

  function lineOf(c: RunCombatant, plan: MovePlan): PathLine {
    const speed = speedOf(c);
    return {
      id: c.instance_id,
      footprint: footprintFor(c),
      from: plan.from,
      to: plan.to,
      steps: plan.steps.map((st) => st.to),
      states: speed === null ? plan.steps.map((): SpeedState => "within") : stepStates(plan, usedFeet(c), speed),
    };
  }

  function groupPlan(movers: RunCombatant[], leaderId: string, target: Cell) {
    return groupMove({
      members: movers.map((m) => ({ id: m.instance_id, position: m.position ?? target, footprint: footprintFor(m) })),
      leaderId,
      leaderTo: target,
      terrain: state.moveTerrain.value,
    });
  }

  /** What a move to `target` by this leader would look like: one path, or the group's paths with "N tokens · X ft each". */
  function previewFor(leader: RunCombatant, target: Cell): MovePreview | null {
    const movers = moversWith(leader.instance_id);
    const labelAt = { ...target, footprint: footprintFor(leader) };
    if (movers.length > 1) {
      const g = groupPlan(movers, leader.instance_id, target);
      const lines = g.moves.flatMap((m) => {
        const c = placedById(m.id);
        return c ? [lineOf(c, m.plan)] : [];
      });
      const lead = lines.find((l) => l.id === leader.instance_id);
      return { lines, text: `${movers.length} tokens · ${g.feet} ft each`, state: lead?.states[lead.states.length - 1] ?? "within", labelAt };
    }
    const plan = planFor(leader, target, waypoints.value);
    if (!plan || plan.steps.length === 0) return null;
    const line = lineOf(leader, plan);
    return { lines: [line], text: moveLabel(plan, usedFeet(leader), speedOf(leader)), state: line.states[line.states.length - 1], labelAt };
  }

  const preview = computed<MovePreview | null>(() => {
    if (!canEdit.value || tool.value !== "move" || toValue(input.placing)) return null;
    const leaderId = dragPreview.value?.id ?? toValue(input.selectedId);
    const leader = leaderId ? placedById(leaderId) : undefined;
    if (!leader) return null;
    const target = dragPreview.value ? dragPreview.value.to : hover.value ? snapAnchor(hover.value, footprintFor(leader)) : null;
    return target ? previewFor(leader, target) : null;
  });

  function applyPlan(instanceId: string, plan: MovePlan) {
    if (plan.steps.length === 0) return;
    state.moveCombatant(instanceId, plan.to);
    // Only the turn-taker's moves count against the turn; the DM shuffling anyone else is just placing them.
    if (store.started && instanceId === state.activeInstanceId.value) store.recordMove(instanceId, plan.from, plan.feet);
  }

  /** Moves a token (and its group) to `to`, charging the active token's feet. */
  function commitMove(instanceId: string, to: Cell) {
    const leader = placedById(instanceId);
    if (!leader?.position) {
      state.moveCombatant(instanceId, to);
      return;
    }
    const movers = moversWith(instanceId);
    if (movers.length > 1) {
      for (const m of groupPlan(movers, instanceId, to).moves) applyPlan(m.id, m.plan);
    } else {
      const plan = planFor(leader, to, waypoints.value);
      if (plan) applyPlan(instanceId, plan);
    }
    waypoints.value = [];
  }

  /** A click on a bare square of the map moves the selected token there. */
  function clickSquare(at: { x: number; y: number } | null) {
    const one = toValue(input.selectedId);
    if (!at || !canEdit.value || tool.value !== "move" || toValue(input.placing) || !one) return;
    const leader = placedById(one);
    if (leader) commitMove(one, snapAnchor(at, footprintFor(leader)));
  }

  function stepSelected(dx: number, dy: number) {
    const one = toValue(input.selectedId);
    const leader = one ? placedById(one) : undefined;
    if (!leader?.position || tool.value !== "move") return;
    commitMove(leader.instance_id, { x: leader.position.x + dx, y: leader.position.y + dy });
  }

  /** Takes back this turn's last move, or all of them (Back to start): the token goes back and the feet come back off the turn. */
  function undoMove(scope: "last" | "all") {
    const id = state.activeInstanceId.value;
    if (!id || !canEdit.value) return;
    const undone = store.undoMove(id, scope);
    if (undone) state.moveCombatant(id, undone.from);
  }

  return {
    selection,
    hover,
    preview,
    waypoints,
    onTokenSelect,
    selectBox,
    clearSelection,
    addWaypoint,
    onDragPreview,
    commitMove,
    clickSquare,
    stepSelected,
    undoMove,
  };
}
