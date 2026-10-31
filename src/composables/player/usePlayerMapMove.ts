// The phone battle map's own turn and move (#1125 decision 14): whose turn it is for the header, the character's speed
// and feet used, and the tap-a-token-then-a-square plan with its confirm. The view wires the map to it.
import { computed, ref, type ComputedRef, type Ref } from "vue";
import { combatantSpeed } from "@/components/encounters/play/playSpeed";
import type { PathLine } from "@/components/encounters/play/PlayMovePath.vue";
import { actsBefore, moveTo, ownMove, type OwnMove } from "@/components/player/playerMapMove";
import { liveState, updateCombatantPosition } from "@/composables/encounters/useEncounterLive";
import { useParty } from "@/composables/party/useParty";
import { useToast } from "@/composables/useToast";
import type { Cell } from "@/lib/battlemap/movement";
import { combatantFootprint } from "@/lib/battlemap/tokenFootprint";
import { sortCombatantsByInitiative } from "@/rules/combatantSort";

export function usePlayerMapMove(
  ownInstanceId: ComputedRef<string | null>,
  activeInstanceId: Ref<string | null>,
) {
  const toast = useToast();
  const { data: party } = useParty();

  async function onOwnTokenMoved(instanceId: string, position: { x: number; y: number }) {
    if (!liveState.value) return;
    if (instanceId !== ownInstanceId.value) return;
    try {
      await updateCombatantPosition(liveState.value.id, instanceId, position);
    } catch (e) {
      toast.error(toast.fromError(e, "Couldn't move your token."));
    }
  }

  // ── Turn and header ─────────────────────────────────────────────────────────
  const ownCombatant = computed(() => liveState.value?.combatants_live?.find((c) => c.instance_id === ownInstanceId.value) ?? null);
  const isMyTurn = computed(() => ownInstanceId.value !== null && activeInstanceId.value === ownInstanceId.value);
  const activeCombatant = computed(() => liveState.value?.combatants_live?.find((c) => c.instance_id === activeInstanceId.value) ?? null);
  const ownSpeed = computed(() => (ownCombatant.value ? combatantSpeed(ownCombatant.value, { monsters: [], npcs: [], members: party.value ?? [] }) : null));
  const ownUsedFeet = computed(() => (isMyTurn.value ? (ownCombatant.value?.movement_used ?? 0) : 0));

  const turnTitle = computed(() => {
    if (isMyTurn.value) return "Your turn";
    return activeCombatant.value && (activeCombatant.value.reveal_state ?? "revealed") === "revealed"
      ? `${activeCombatant.value.name}'s turn`
      : "Waiting for your turn";
  });
  const turnSubtitle = computed(() => {
    const round = liveState.value ? `Round ${liveState.value.current_round}` : null;
    if (isMyTurn.value) {
      if (ownSpeed.value === null) return round;
      return `${round} · ${Math.max(0, ownSpeed.value - ownUsedFeet.value)} ft to move`;
    }
    const list = liveState.value?.combatants_live;
    const before = list && ownInstanceId.value ? actsBefore(sortCombatantsByInitiative(list), ownInstanceId.value) : null;
    return before ? `You're after the ${before}` : round;
  });
  const turnPortraitUrl = computed(() => ownCombatant.value?.portrait_url ?? null);
  const ownHp = computed(() => (ownCombatant.value ? { current: ownCombatant.value.hp, max: ownCombatant.value.max_hp } : null));

  // ── Moving: tap your token, then a square ───────────────────────────────────
  const picked = ref(false);
  const pickedSet = computed<ReadonlySet<string> | null>(() => (picked.value && ownInstanceId.value ? new Set([ownInstanceId.value]) : null));
  const target = ref<Cell | null>(null);
  const dragTo = ref<Cell | null>(null);
  const moving = ref(false);

  const ownFootprint = computed(() => (ownCombatant.value ? combatantFootprint(ownCombatant.value) : 1));

  function movePlan(to: Cell | null, tapped: boolean): OwnMove | null {
    const from = ownCombatant.value?.position;
    if (!to || !from || !ownInstanceId.value) return null;
    const common = { instanceId: ownInstanceId.value, from, footprint: ownFootprint.value, speed: ownSpeed.value, usedFeet: ownUsedFeet.value };
    return tapped ? ownMove({ ...common, pointer: to }) : moveTo({ ...common, to });
  }
  // `target` is the pointer's place in cells, so the snap happens here, the same rounding a drag uses.
  const pending = computed(() => movePlan(target.value, true));
  const dragging = computed(() => movePlan(dragTo.value, false));
  const pathLines = computed<PathLine[]>(() => {
    const m = pending.value ?? dragging.value;
    return m ? [m.line] : [];
  });

  function onOwnTokenTapped(instanceId: string) {
    if (instanceId !== ownInstanceId.value) return;
    picked.value = true;
  }
  function onOwnTokenDragPreview(instanceId: string, to: Cell | null) {
    dragTo.value = instanceId === ownInstanceId.value ? to : null;
  }

  function cancelMove() {
    target.value = null;
    picked.value = false;
  }

  async function confirmMove() {
    const m = pending.value;
    if (!m || !ownInstanceId.value) return;
    moving.value = true;
    try {
      await onOwnTokenMoved(ownInstanceId.value, m.plan.to);
    } finally {
      moving.value = false;
      cancelMove();
    }
  }

  return {
    ownCombatant, isMyTurn, activeCombatant, turnTitle, turnSubtitle, turnPortraitUrl, ownHp,
    picked, pickedSet, target, moving, pending, pathLines,
    onOwnTokenMoved, onOwnTokenTapped, onOwnTokenDragPreview, cancelMove, confirmMove,
  };
}
