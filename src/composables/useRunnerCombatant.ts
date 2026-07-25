import { ref, computed, toValue, type MaybeRefOrGetter } from "vue";
import { useEncounterRunStore } from "@/stores/encounterRun";
import { useParty } from "@/composables/useParty";
import { useAllMonsters } from "@/composables/useMonsters";
import { useAutoDiscoverMonsters } from "@/composables/useDiscoveredMonsters";
import { useConcentration } from "@/composables/useConcentration";
import { useShieldAcBonus } from "@/composables/useShieldAc";
import {
  getExhaustionLevel,
  setExhaustionLevel,
  isExhaustion,
} from "@/lib/conditions";
import type { ConditionName } from "@/lib/conditions";
import { CONCENTRATION_BREAKING_CONDITIONS } from "@/composables/useConcentration";
import type { RunCombatant, RevealState } from "@/types/encounter.types";

/**
 * Per-combatant logic for the encounter runner. Intended to be called once per
 * RunnerCombatantRow / RunnerCombatantCard instance so each component owns its
 * own flash state, pending HP timer, and quick-amount field.
 */
export function useRunnerCombatant(getCombatant: MaybeRefOrGetter<RunCombatant>) {
  const store = useEncounterRunStore();
  const { data: partyList } = useParty();
  const { data: monsters } = useAllMonsters();
  const { mutateAsync: autoDiscover } = useAutoDiscoverMonsters();
  const { rollConcentrationSave, endConcentration } = useConcentration();
  const { acFor } = useShieldAcBonus();

  const partyMap = computed(
    () => new Map(partyList.value?.map((m) => [m.id, m]) ?? []),
  );

  const combatant = computed(() => toValue(getCombatant));

  // ── Display derivations ───────────────────────────────────────────────────

  const wildshape = computed(() => {
    const c = combatant.value;
    if (c.type === "player")
      return partyMap.value.get(c.party_member_id ?? "")?.wildshape_state ?? undefined;
    return c.wildshape;
  });

  const displayHp = computed((): number => {
    const c = combatant.value;
    if (c.type === "player") {
      const m = partyMap.value.get(c.party_member_id ?? "");
      if (m) return m.wildshape_state?.beast_hp ?? m.current_hp;
    }
    return c.wildshape?.beast_hp ?? c.hp;
  });

  const displayMaxHp = computed((): number => {
    const c = combatant.value;
    if (c.type === "player") {
      const m = partyMap.value.get(c.party_member_id ?? "");
      if (m) return m.wildshape_state?.beast_max_hp ?? m.max_hp;
    }
    return c.wildshape?.beast_max_hp ?? c.max_hp;
  });

  // Temp HP survives Wild Shape and is spent before the beast's HP, so it is
  // shown in both forms. For players the party row is the authority — the player
  // can grant themselves temp HP on their own sheet mid-encounter.
  const displayTempHp = computed((): number => {
    const c = combatant.value;
    if (c.type === "player") {
      const m = partyMap.value.get(c.party_member_id ?? "");
      if (m) return m.temp_hp;
    }
    return c.temp_hp ?? 0;
  });

  const displayAc = computed((): string => {
    const c = combatant.value;
    if (c.type === "player") {
      const m = partyMap.value.get(c.party_member_id ?? "");
      if (m) return m.wildshape_state?.beast_ac ?? String(acFor(m));
    }
    return c.wildshape?.beast_ac ?? c.ac;
  });

  const displayConditions = computed((): string[] => {
    const c = combatant.value;
    if (c.type === "player") {
      const m = partyMap.value.get(c.party_member_id ?? "");
      return m?.conditions ?? c.conditions;
    }
    return c.conditions;
  });

  const pcConcentration = computed((): string | null => {
    const c = combatant.value;
    if (!c.party_member_id) return null;
    const m = partyList.value?.find((p) => p.id === c.party_member_id);
    return m?.concentration?.spellName ?? null;
  });

  function combatantInitials(): string {
    return combatant.value.name
      .split(" ")
      .slice(0, 2)
      .map((w) => w[0] ?? "")
      .join("")
      .toUpperCase();
  }

  function factionColor(): string {
    return store.factions.find((f) => f.id === combatant.value.faction_id)?.color ?? "#3D3D3D";
  }

  function revealBtnClass(state: RevealState | undefined): string {
    if (state === "revealed") return "reveal-revealed";
    if (state === "unseen") return "reveal-unseen";
    return "reveal-hidden";
  }

  function revealBtnTitle(state: RevealState | undefined): string {
    if (state === "revealed") return "Revealed — click to hide";
    if (state === "unseen") return "Unseen — click to reveal";
    return "Hidden — click to show slot";
  }

  function nonExhaustion(conditions: string[]): string[] {
    return conditions.filter((c) => !isExhaustion(c));
  }

  // ── Flash overlay ─────────────────────────────────────────────────────────

  const flashInfo = ref<{ delta: number; id: number } | undefined>(undefined);

  function showFlash(delta: number) {
    flashInfo.value = { delta, id: Date.now() };
  }

  function clearFlash() {
    flashInfo.value = undefined;
  }

  // ── HP management ─────────────────────────────────────────────────────────

  let pendingDelta = 0;
  let pendingTimer: ReturnType<typeof setTimeout> | undefined;

  function handleAdjustHp(delta: number) {
    pendingDelta += delta;
    if (pendingTimer) clearTimeout(pendingTimer);
    pendingTimer = setTimeout(() => {
      if (pendingDelta !== 0) {
        store.adjustHp(combatant.value.instance_id, pendingDelta);
        showFlash(pendingDelta);
      }
      pendingDelta = 0;
      pendingTimer = undefined;
    }, 500);
  }

  function handleSetHp(newHp: number) {
    if (pendingTimer) {
      clearTimeout(pendingTimer);
      pendingTimer = undefined;
      pendingDelta = 0;
    }
    const delta = newHp - displayHp.value;
    store.setHp(combatant.value.instance_id, newHp);
    if (delta !== 0) showFlash(delta);
  }

  function handleSetMaxHp(newMax: number) {
    if (!Number.isFinite(newMax) || newMax < 1) return;
    store.setMaxHp(combatant.value.instance_id, newMax);
  }

  // ── Quick HP ──────────────────────────────────────────────────────────────

  const quickAmount = ref<number | null>(null);

  async function quickDamage() {
    const amt = quickAmount.value;
    if (!amt) return;
    const c = combatant.value;
    const memberBefore = c.party_member_id
      ? (partyList.value?.find((m) => m.id === c.party_member_id) ?? null)
      : null;
    const hpBefore = displayHp.value;
    store.adjustHp(c.instance_id, -amt);
    showFlash(-amt);
    quickAmount.value = null;
    if (memberBefore?.concentration && amt > 0) {
      const newHp = Math.max(0, hpBefore - amt);
      if (newHp === 0) {
        await endConcentration(memberBefore, { reason: "dropped to 0 HP" });
      } else {
        await rollConcentrationSave(memberBefore, amt);
      }
    }
  }

  function quickHeal() {
    const amt = quickAmount.value;
    if (!amt) return;
    store.adjustHp(combatant.value.instance_id, amt);
    showFlash(amt);
    quickAmount.value = null;
  }

  function quickTemp() {
    const amt = quickAmount.value;
    if (!amt) return;
    store.setTempHp(combatant.value.instance_id, amt);
    quickAmount.value = null;
  }

  // ── Conditions ────────────────────────────────────────────────────────────

  function onExhaustionChange(newLevel: number) {
    store.setConditions(
      combatant.value.instance_id,
      setExhaustionLevel(displayConditions.value, newLevel),
    );
  }

  async function onConditionPickerPick(name: ConditionName) {
    if (name === "Exhaustion") {
      onExhaustionChange(getExhaustionLevel(displayConditions.value) > 0 ? 0 : 1);
    } else {
      const wasActive = displayConditions.value.includes(name);
      store.toggleCondition(combatant.value.instance_id, name);
      if (!wasActive && CONCENTRATION_BREAKING_CONDITIONS.includes(name)) {
        const c = combatant.value;
        const member = c.party_member_id
          ? (partyList.value?.find((m) => m.id === c.party_member_id) ?? null)
          : null;
        if (member?.concentration) {
          await endConcentration(member, { reason: name.toLowerCase() });
        }
      }
    }
  }

  // ── Concentration ─────────────────────────────────────────────────────────

  async function dropCombatantConcentration() {
    const c = combatant.value;
    if (!c.party_member_id) return;
    const member = partyList.value?.find((m) => m.id === c.party_member_id);
    if (!member?.concentration) return;
    await endConcentration(member, { reason: "dropped" });
  }

  // ── Reveal ────────────────────────────────────────────────────────────────

  async function handleCycleReveal() {
    const c = combatant.value;
    store.cycleRevealState(c.instance_id);
    const updated = store.sortedCombatants.find((x) => x.instance_id === c.instance_id);
    if (updated?.reveal_state !== "revealed" || !updated.monster_id) return;
    const monstersToDiscover = (monsters.value ?? []).filter((m) => m.id === updated.monster_id);
    const partyMemberIds = (partyList.value ?? []).map((m) => m.id);
    if (monstersToDiscover.length && partyMemberIds.length) {
      void autoDiscover({ monsters: monstersToDiscover, partyMemberIds });
    }
  }

  return {
    wildshape,
    displayHp,
    displayMaxHp,
    displayTempHp,
    displayAc,
    displayConditions,
    pcConcentration,
    combatantInitials,
    factionColor,
    revealBtnClass,
    revealBtnTitle,
    nonExhaustion,
    flashInfo,
    clearFlash,
    handleAdjustHp,
    handleSetHp,
    handleSetMaxHp,
    quickAmount,
    quickDamage,
    quickHeal,
    quickTemp,
    onExhaustionChange,
    onConditionPickerPick,
    dropCombatantConcentration,
    handleCycleReveal,
  };
}
