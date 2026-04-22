<template>
  <!--
    Two completely different UIs:
    - Desktop (≥md): grid table with narrow INIT/HP/AC columns. Runs along
      the existing code path — this is a DM's full-combat view at a glance.
    - Mobile (<md): vertically stacked card per combatant. Preserves all
      controls (init, HP, +/-, quick Dmg/Heal, conditions) but lays them
      on 3-4 rows so HP management never overlaps the name.

    Same script drives both layouts — only the template branches.
  -->
  <template v-if="!isMobile">
  <!-- Column headers -->
  <div class="combatant-header">
    <span></span>
    <span>INIT</span>
    <span>NAME</span>
    <span>HP</span>
    <span>AC</span>
    <span>CONDITIONS</span>
  </div>

  <!-- Combatant rows -->
  <div
    v-for="combatant in store.sortedCombatants"
    :key="combatant.instance_id"
    class="combatant-wrap"
  >
  <div
    class="combatant-row"
    :class="{
      'is-active': store.started && combatant.instance_id === store.activeCombatant?.instance_id,
      'is-dead': combatant.type === 'monster' && combatant.hp === 0,
      'is-selected': combatant.instance_id === props.selectedId,
    }"
    :style="{ '--faction-color': factionColor(combatant.faction_id) }"
    @click="toggleDetail(combatant.instance_id)"
  >
    <!-- Avatar + reveal toggle (monsters only) -->
    <div class="avatar-cell" @click.stop="toggleDetail(combatant.instance_id)">
      <div
        class="avatar-inner"
        :class="store.started && combatant.instance_id === store.activeCombatant?.instance_id ? 'avatar-active' : ''"
      >
        <FocalImage
          v-if="getWildshape(combatant)?.beast_image_url ?? combatant.portrait_url"
          :src="(getWildshape(combatant)?.beast_image_url ?? combatant.portrait_url)!"
          :alt="getWildshape(combatant)?.beast_name ?? combatant.name"
          :focal-point="getWildshape(combatant)?.beast_image_url ? null : (combatant.portrait_focal_point ?? null)"
          format="square"
        />
        <div v-else class="avatar-initials" :style="{ backgroundColor: factionColor(combatant.faction_id) + '44', color: factionColor(combatant.faction_id) }">
          {{ combatantInitials(combatant) }}
        </div>
        <button
          v-if="combatant.type === 'monster'"
          type="button"
          class="reveal-btn"
          :class="revealBtnClass(combatant.reveal_state)"
          :title="revealBtnTitle(combatant.reveal_state)"
          @click.stop="handleCycleReveal(combatant)"
        >
          <EyeOff v-if="combatant.reveal_state === 'hidden'" class="h-2.5 w-2.5" />
          <Eye v-else-if="combatant.reveal_state === 'unseen'" class="h-2.5 w-2.5" />
          <Eye v-else class="h-2.5 w-2.5" />
        </button>
      </div>
    </div>

    <!-- Initiative -->
    <div class="init-cell" @click.stop>
      <input
        type="number"
        :value="combatant.initiative ?? ''"
        placeholder="—"
        class="init-input"
        @change="(e) => store.setInitiative(combatant.instance_id, Number((e.target as HTMLInputElement).value))"
      />
    </div>

    <!-- Name + type badge -->
    <div class="name-cell">
      <span class="combatant-name">{{ combatant.name }}</span>
      <span class="type-badge" :class="combatant.type">{{ combatant.type === 'player' ? 'PC' : combatant.npc_id ? 'NPC' : 'Monster' }}</span>
      <span v-if="getWildshape(combatant)" class="wildshape-row-badge" title="Wildshaping">🐺 {{ getWildshape(combatant)!.beast_name }}</span>
      <span v-if="combatant.hp === 0 && combatant.type === 'monster'" class="dead-badge">☠</span>
      <button
        v-if="combatant.surprised"
        type="button"
        class="surprised-badge surprised-toggle"
        title="Surprised — click to remove"
        @click.stop="store.toggleSurprised(combatant.instance_id)"
      >✦ Surprised ×</button>
      <button
        v-else-if="!store.started || store.round === 1"
        type="button"
        class="surprised-set-btn"
        title="Mark as surprised"
        @click.stop="store.toggleSurprised(combatant.instance_id)"
      >✦?</button>
    </div>

    <!-- HP -->
    <div class="hp-cell" @click.stop>
      <button class="hp-btn" @click="handleAdjustHp(combatant.instance_id, -1)">−</button>
      <input
        type="number"
        :value="displayHp(combatant)"
        min="0"
        :max="displayMaxHp(combatant)"
        class="hp-input"
        @change="(e) => handleSetHp(combatant.instance_id, Number((e.target as HTMLInputElement).value))"
      />
      <span class="hp-max">/ {{ displayMaxHp(combatant) }}</span>
      <button class="hp-btn" @click="handleAdjustHp(combatant.instance_id, 1)">+</button>
      <span
        v-if="flashState[combatant.instance_id]"
        :key="flashState[combatant.instance_id]!.id"
        class="damage-flash"
        :class="flashState[combatant.instance_id]!.delta < 0 ? 'is-damage' : 'is-heal'"
        @animationend="clearFlash(combatant.instance_id)"
      >{{ flashState[combatant.instance_id]!.delta > 0 ? '+' : '' }}{{ flashState[combatant.instance_id]!.delta }}</span>
    </div>

    <!-- AC -->
    <div class="ac-cell">
      <span class="ac-value">{{ displayAc(combatant) }}</span>
    </div>

    <!-- Conditions -->
    <div class="conditions-cell" @click.stop>
      <ExhaustionChip
        v-if="getExhaustionLevel(displayConditions(combatant)) > 0"
        variant="amber"
        :level="getExhaustionLevel(displayConditions(combatant))"
        @update="(lvl) => onExhaustionChange(combatant.instance_id, lvl)"
      />
      <span
        v-for="cond in nonExhaustion(displayConditions(combatant))"
        :key="cond"
        class="cond-badge"
        @click="store.toggleCondition(combatant.instance_id, cond)"
        :title="`${cond} — click to remove\n\n${getConditionDescription(cond)}`"
      >{{ cond }} ×</span>
      <span
        v-if="pcConcentration(combatant)"
        class="conc-chip"
        :title="`Concentrating on ${pcConcentration(combatant)} — click to drop`"
        @click="dropCombatantConcentration(combatant)"
      >✦ {{ pcConcentration(combatant) }} ×</span>
      <button
        v-if="store.started"
        type="button"
        class="reaction-chip"
        :class="combatant.reactionUsed ? 'reaction-used' : 'reaction-ready'"
        :title="combatant.reactionUsed ? 'Reaction used — click to restore' : 'Reaction available — click to mark used'"
        @click="store.toggleReaction(combatant.instance_id)"
      >⚡</button>
      <div class="relative" v-if="addingCondFor !== combatant.instance_id">
        <button class="add-cond-btn" @click="addingCondFor = combatant.instance_id">+</button>
      </div>
      <div v-else class="cond-picker">
        <select
          size="5"
          class="cond-select"
          @change="(e) => onPickCondition(combatant.instance_id, (e.target as HTMLSelectElement).value)"
          @blur="addingCondFor = null"
        >
          <option v-for="c in availableConditions(combatant)" :key="c" :value="c">{{ c }}</option>
        </select>
      </div>
    </div>
  </div>

  <!-- Quick HP panel — shown when row is selected -->
  <div
    v-if="combatant.instance_id === props.selectedId"
    class="hp-quick-panel"
    @click.stop
  >
    <input
      v-model.number="quickAmounts[combatant.instance_id]"
      type="number"
      min="0"
      placeholder="amt"
      class="quick-input"
      @keydown.enter="quickDamage(combatant.instance_id)"
    />
    <button type="button" class="quick-btn quick-dmg" @click="quickDamage(combatant.instance_id)">Dmg</button>
    <button type="button" class="quick-btn quick-heal" @click="quickHeal(combatant.instance_id)">Heal</button>
    <button type="button" class="quick-btn quick-temp" @click="quickTemp(combatant.instance_id)">+Temp</button>
    <span v-if="combatant.temp_hp" class="quick-temp-display">{{ combatant.temp_hp }} tmp</span>
  </div>

  </div><!-- /combatant-wrap -->
  </template>

  <!-- ─────────────────────────────────────────────────────────────────────
       Mobile: stacked card per combatant. One vertical column, wide tap
       targets, HP controls on their own row so they can never overlap the
       name.
       ───────────────────────────────────────────────────────────────────── -->
  <template v-else>
    <div
      v-for="combatant in store.sortedCombatants"
      :key="combatant.instance_id"
      class="mc-card"
      :class="{
        'is-active': store.started && combatant.instance_id === store.activeCombatant?.instance_id,
        'is-dead': combatant.type === 'monster' && combatant.hp === 0,
        'is-selected': combatant.instance_id === props.selectedId,
      }"
      :style="{ '--faction-color': factionColor(combatant.faction_id) }"
      @click="toggleDetail(combatant.instance_id)"
    >
      <!-- Row 1: avatar + name + type badge -->
      <div class="mc-head">
        <div class="mc-avatar" @click.stop="toggleDetail(combatant.instance_id)">
          <div
            class="avatar-inner"
            :class="store.started && combatant.instance_id === store.activeCombatant?.instance_id ? 'avatar-active' : ''"
          >
            <FocalImage
              v-if="getWildshape(combatant)?.beast_image_url ?? combatant.portrait_url"
              :src="(getWildshape(combatant)?.beast_image_url ?? combatant.portrait_url)!"
              :alt="getWildshape(combatant)?.beast_name ?? combatant.name"
              :focal-point="getWildshape(combatant)?.beast_image_url ? null : (combatant.portrait_focal_point ?? null)"
              format="square"
            />
            <div v-else class="avatar-initials" :style="{ backgroundColor: factionColor(combatant.faction_id) + '44', color: factionColor(combatant.faction_id) }">
              {{ combatantInitials(combatant) }}
            </div>
            <button
              v-if="combatant.type === 'monster'"
              type="button"
              class="reveal-btn"
              :class="revealBtnClass(combatant.reveal_state)"
              :title="revealBtnTitle(combatant.reveal_state)"
              @click.stop="handleCycleReveal(combatant)"
            >
              <EyeOff v-if="combatant.reveal_state === 'hidden'" class="h-2.5 w-2.5" />
              <Eye v-else-if="combatant.reveal_state === 'unseen'" class="h-2.5 w-2.5" />
              <Eye v-else class="h-2.5 w-2.5" />
            </button>
          </div>
        </div>
        <div class="mc-identity">
          <span class="combatant-name">{{ combatant.name }}</span>
          <div class="mc-badges">
            <span class="type-badge" :class="combatant.type">{{ combatant.type === 'player' ? 'PC' : combatant.npc_id ? 'NPC' : 'Monster' }}</span>
            <span v-if="getWildshape(combatant)" class="wildshape-row-badge" title="Wildshaping">🐺 {{ getWildshape(combatant)!.beast_name }}</span>
            <span v-if="combatant.hp === 0 && combatant.type === 'monster'" class="dead-badge">☠</span>
            <button
              v-if="combatant.surprised"
              type="button"
              class="surprised-badge surprised-toggle"
              title="Surprised — tap to remove"
              @click.stop="store.toggleSurprised(combatant.instance_id)"
            >✦ Surprised ×</button>
            <button
              v-else-if="!store.started || store.round === 1"
              type="button"
              class="surprised-set-btn"
              title="Mark as surprised"
              @click.stop="store.toggleSurprised(combatant.instance_id)"
            >✦?</button>
          </div>
        </div>
      </div>

      <!-- Row 2: stats (init input + HP / max + AC) -->
      <div class="mc-stats" @click.stop>
        <label class="mc-stat-init">
          <span class="mc-stat-label">INIT</span>
          <input
            type="number"
            :value="combatant.initiative ?? ''"
            placeholder="—"
            class="init-input"
            @change="(e) => store.setInitiative(combatant.instance_id, Number((e.target as HTMLInputElement).value))"
          />
        </label>
        <div class="mc-stat-hp">
          <span class="mc-stat-label">HP</span>
          <span class="mc-stat-value">{{ displayHp(combatant) }}<span class="mc-stat-sep">/</span>{{ displayMaxHp(combatant) }}</span>
          <span v-if="combatant.temp_hp" class="mc-stat-temp">+{{ combatant.temp_hp }} tmp</span>
        </div>
        <div class="mc-stat-ac">
          <span class="mc-stat-label">AC</span>
          <span class="mc-stat-value">{{ displayAc(combatant) }}</span>
        </div>
      </div>

      <!-- Row 3: HP adjust controls -->
      <div class="mc-hp-controls" @click.stop>
        <button class="hp-btn hp-btn-lg" @click="handleAdjustHp(combatant.instance_id, -1)">−</button>
        <input
          type="number"
          :value="displayHp(combatant)"
          min="0"
          :max="displayMaxHp(combatant)"
          class="hp-input hp-input-lg"
          @change="(e) => handleSetHp(combatant.instance_id, Number((e.target as HTMLInputElement).value))"
        />
        <button class="hp-btn hp-btn-lg" @click="handleAdjustHp(combatant.instance_id, 1)">+</button>
        <span
          v-if="flashState[combatant.instance_id]"
          :key="flashState[combatant.instance_id]!.id"
          class="damage-flash"
          :class="flashState[combatant.instance_id]!.delta < 0 ? 'is-damage' : 'is-heal'"
          @animationend="clearFlash(combatant.instance_id)"
        >{{ flashState[combatant.instance_id]!.delta > 0 ? '+' : '' }}{{ flashState[combatant.instance_id]!.delta }}</span>
      </div>

      <!-- Row 4: quick Dmg/Heal/Temp (visible when card is selected) -->
      <div
        v-if="combatant.instance_id === props.selectedId"
        class="mc-quick"
        @click.stop
      >
        <input
          v-model.number="quickAmounts[combatant.instance_id]"
          type="number"
          min="0"
          placeholder="amt"
          class="quick-input"
          @keydown.enter="quickDamage(combatant.instance_id)"
        />
        <button type="button" class="quick-btn quick-dmg" @click="quickDamage(combatant.instance_id)">Dmg</button>
        <button type="button" class="quick-btn quick-heal" @click="quickHeal(combatant.instance_id)">Heal</button>
        <button type="button" class="quick-btn quick-temp" @click="quickTemp(combatant.instance_id)">+Temp</button>
      </div>

      <!-- Row 5: conditions (wraps) -->
      <div class="mc-conditions" @click.stop>
        <ExhaustionChip
          v-if="getExhaustionLevel(displayConditions(combatant)) > 0"
          variant="amber"
          :level="getExhaustionLevel(displayConditions(combatant))"
          @update="(lvl) => onExhaustionChange(combatant.instance_id, lvl)"
        />
        <span
          v-for="cond in nonExhaustion(displayConditions(combatant))"
          :key="cond"
          class="cond-badge"
          @click="store.toggleCondition(combatant.instance_id, cond)"
          :title="`${cond} — tap to remove\n\n${getConditionDescription(cond)}`"
        >{{ cond }} ×</span>
        <button
          v-if="store.started"
          type="button"
          class="reaction-chip"
          :class="combatant.reactionUsed ? 'reaction-used' : 'reaction-ready'"
          :title="combatant.reactionUsed ? 'Reaction used — tap to restore' : 'Reaction available — tap to mark used'"
          @click="store.toggleReaction(combatant.instance_id)"
        >⚡</button>
        <div v-if="addingCondFor !== combatant.instance_id" class="relative">
          <button class="add-cond-btn" @click="addingCondFor = combatant.instance_id">+</button>
        </div>
        <div v-else class="cond-picker">
          <select
            size="5"
            class="cond-select"
            @change="(e) => onPickCondition(combatant.instance_id, (e.target as HTMLSelectElement).value)"
            @blur="addingCondFor = null"
          >
            <option v-for="c in availableConditions(combatant)" :key="c" :value="c">{{ c }}</option>
          </select>
        </div>
      </div>
    </div>
  </template>

  <p v-if="!store.sortedCombatants.length" class="empty-runner">
    No combatants. Go back to the builder to add monsters and party members.
  </p>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { Eye, EyeOff } from "lucide-vue-next";
import FocalImage from "@/components/common/FocalImage.vue";
import { useEncounterRunStore } from "@/stores/encounterRun";
import { useIsMobile } from "@/composables/useBreakpoint";
import { useParty } from "@/composables/useParty";
import { useAllMonsters } from "@/composables/useMonsters";
import { useAutoDiscoverMonsters } from "@/composables/useDiscoveredMonsters";
import { useConcentration } from "@/composables/useConcentration";
import {
  CONDITIONS,
  getConditionDescription,
  getExhaustionLevel,
  setExhaustionLevel,
  isExhaustion,
} from "@/lib/conditions";
import { CONCENTRATION_BREAKING_CONDITIONS } from "@/composables/useConcentration";
import ExhaustionChip from "@/components/common/ExhaustionChip.vue";
import type { RunCombatant, RevealState } from "@/types/encounter.types";

const isMobile = useIsMobile();

const props = defineProps<{
  selectedId: string | null;
}>();

const emit = defineEmits<{
  select: [id: string | null];
}>();

const store = useEncounterRunStore();
const { data: partyList } = useParty();
const { data: monsters } = useAllMonsters();
const { mutateAsync: autoDiscover } = useAutoDiscoverMonsters();
const { rollConcentrationSave, endConcentration } = useConcentration();
const addingCondFor = ref<string | null>(null);
const quickAmounts = ref<Record<string, number | null>>({});

// O(1) lookup map — avoids repeated find() per-helper per-combatant per-render
const partyMap = computed(() => new Map(partyList.value?.map((m) => [m.id, m]) ?? []));

function getWildshape(c: RunCombatant) {
  if (c.type === "player") return partyMap.value.get(c.party_member_id ?? "")?.wildshape_state ?? undefined;
  return c.wildshape;
}

function displayHp(c: RunCombatant): number {
  if (c.type === "player") {
    const m = partyMap.value.get(c.party_member_id ?? "");
    if (m) return m.wildshape_state?.beast_hp ?? m.current_hp;
  }
  return c.wildshape?.beast_hp ?? c.hp;
}

function displayMaxHp(c: RunCombatant): number {
  if (c.type === "player") {
    const m = partyMap.value.get(c.party_member_id ?? "");
    if (m) return m.wildshape_state?.beast_max_hp ?? m.max_hp;
  }
  return c.wildshape?.beast_max_hp ?? c.max_hp;
}

function displayAc(c: RunCombatant): string {
  if (c.type === "player") {
    const m = partyMap.value.get(c.party_member_id ?? "");
    if (m) return m.wildshape_state?.beast_ac ?? String(m.ac);
  }
  return c.wildshape?.beast_ac ?? c.ac;
}

function displayConditions(c: RunCombatant): string[] {
  if (c.type === "player") {
    const m = partyMap.value.get(c.party_member_id ?? "");
    return m?.conditions ?? c.conditions;
  }
  return c.conditions;
}

const pendingDeltas = new Map<string, number>();
const pendingTimers = new Map<string, ReturnType<typeof setTimeout>>();

// Flash overlay state: maps instance_id → { delta, id } while flash is active
const flashState = ref<Record<string, { delta: number; id: number } | undefined>>({});

function showFlash(instanceId: string, delta: number) {
  flashState.value[instanceId] = { delta, id: Date.now() };
}

function clearFlash(instanceId: string) {
  delete flashState.value[instanceId];
}

function handleAdjustHp(instanceId: string, delta: number) {
  const current = pendingDeltas.get(instanceId) ?? 0;
  pendingDeltas.set(instanceId, current + delta);

  const existing = pendingTimers.get(instanceId);
  if (existing) clearTimeout(existing);

  const timer = setTimeout(() => {
    const total = pendingDeltas.get(instanceId) ?? 0;
    if (total !== 0) {
      store.adjustHp(instanceId, total);
      showFlash(instanceId, total);
    }
    pendingDeltas.delete(instanceId);
    pendingTimers.delete(instanceId);
  }, 500);

  pendingTimers.set(instanceId, timer);
}

function handleSetHp(instanceId: string, newHp: number) {
  // Cancel any pending debounced adjustments
  const timer = pendingTimers.get(instanceId);
  if (timer) {
    clearTimeout(timer);
    pendingTimers.delete(instanceId);
    pendingDeltas.delete(instanceId);
  }

  const combatant = store.sortedCombatants.find((c) => c.instance_id === instanceId);
  const currentHp = combatant ? displayHp(combatant) : 0;
  const delta = newHp - currentHp;
  store.setHp(instanceId, newHp);
  if (delta !== 0) showFlash(instanceId, delta);
}

function toggleDetail(instanceId: string) {
  if (props.selectedId === instanceId) {
    emit("select", null);
  } else {
    emit("select", instanceId);
  }
}

function factionColor(factionId: string): string {
  return store.factions.find((f) => f.id === factionId)?.color ?? "#3D3D3D";
}

function availableConditions(c: RunCombatant): string[] {
  // Hide non-exhaustion conditions the creature already has, and hide the
  // single "Exhaustion" picker entry once they have any level of it (the
  // chip's pips become the level control instead).
  const conditions = displayConditions(c);
  const hasExhaustion = getExhaustionLevel(conditions) > 0;
  return CONDITIONS.filter((cond) => {
    if (cond === "Exhaustion") return !hasExhaustion;
    return !conditions.includes(cond);
  });
}

function nonExhaustion(conditions: string[]): string[] {
  return conditions.filter((c) => !isExhaustion(c));
}

/**
 * Picker handler. Special-cased for "Exhaustion" — that selector adds level
 * 1; any subsequent level changes happen via the chip's pips. Other names
 * are stored as-is.
 */
async function onPickCondition(instanceId: string, value: string) {
  if (!value) { addingCondFor.value = null; return; }
  if (value === "Exhaustion") {
    onExhaustionChange(instanceId, 1);
  } else {
    store.toggleCondition(instanceId, value);
    // Concentration-breaking conditions end concentration on PCs automatically.
    if (CONCENTRATION_BREAKING_CONDITIONS.includes(value)) {
      const c = store.sortedCombatants.find((x) => x.instance_id === instanceId);
      const member = c?.party_member_id
        ? partyList.value?.find((m) => m.id === c.party_member_id) ?? null
        : null;
      if (member?.concentration) {
        await endConcentration(member, { reason: value.toLowerCase() });
      }
    }
  }
  addingCondFor.value = null;
}

function onExhaustionChange(instanceId: string, newLevel: number) {
  const combatant = store.sortedCombatants.find((c) => c.instance_id === instanceId);
  if (!combatant) return;
  const next = setExhaustionLevel(displayConditions(combatant), newLevel);
  store.setConditions(instanceId, next);
}

function pcConcentration(c: RunCombatant): string | null {
  if (!c.party_member_id) return null;
  const m = partyList.value?.find((p) => p.id === c.party_member_id);
  return m?.concentration?.spellName ?? null;
}

async function dropCombatantConcentration(c: RunCombatant) {
  if (!c.party_member_id) return;
  const member = partyList.value?.find((m) => m.id === c.party_member_id);
  if (!member?.concentration) return;
  await endConcentration(member, { reason: "dropped" });
}

function combatantInitials(c: RunCombatant): string {
  return c.name.split(" ").slice(0, 2).map((w) => w[0] ?? "").join("").toUpperCase();
}

function revealBtnClass(state: RevealState | undefined) {
  if (state === "revealed") return "reveal-revealed";
  if (state === "unseen")   return "reveal-unseen";
  return "reveal-hidden";
}

function revealBtnTitle(state: RevealState | undefined) {
  if (state === "revealed") return "Revealed — click to hide";
  if (state === "unseen")   return "Unseen — click to reveal";
  return "Hidden — click to show slot";
}

function handleCycleReveal(combatant: RunCombatant) {
  store.cycleRevealState(combatant.instance_id);
  const updated = store.sortedCombatants.find((c) => c.instance_id === combatant.instance_id);
  if (updated?.reveal_state !== "revealed" || !updated.monster_id) return;
  const monstersToDiscover = (monsters.value ?? []).filter((m) => m.id === updated.monster_id);
  const partyMemberIds = (partyList.value ?? []).map((m) => m.id);
  if (monstersToDiscover.length && partyMemberIds.length) {
    void autoDiscover({ monsters: monstersToDiscover, partyMemberIds });
  }
}

async function quickDamage(instanceId: string) {
  const amt = quickAmounts.value[instanceId];
  if (!amt) return;
  const c = store.sortedCombatants.find((x) => x.instance_id === instanceId);
  const memberId = c?.party_member_id;
  const memberBefore = memberId ? partyList.value?.find((m) => m.id === memberId) ?? null : null;
  const hpBefore = c ? displayHp(c) : 0;

  store.adjustHp(instanceId, -amt);
  showFlash(instanceId, -amt);
  quickAmounts.value[instanceId] = null;

  // Concentration check for PCs only — monsters/NPCs don't currently have
  // concentration state on party_members, so there's nothing to roll against.
  if (memberBefore?.concentration && amt > 0) {
    const newHp = Math.max(0, hpBefore - amt);
    if (newHp === 0) {
      await endConcentration(memberBefore, { reason: "dropped to 0 HP" });
    } else {
      await rollConcentrationSave(memberBefore, amt);
    }
  }
}

function quickHeal(instanceId: string) {
  const amt = quickAmounts.value[instanceId];
  if (!amt) return;
  store.adjustHp(instanceId, amt);
  showFlash(instanceId, amt);
  quickAmounts.value[instanceId] = null;
}

function quickTemp(instanceId: string) {
  const amt = quickAmounts.value[instanceId];
  if (!amt) return;
  store.setTempHp(instanceId, amt);
  quickAmounts.value[instanceId] = null;
}
</script>

<style scoped>
@reference "@/assets/main.css";

.combatant-header {
  display: grid;
  grid-template-columns: 2.5rem 3.5rem 1fr 10rem 3rem 1fr;
  gap: 0.5rem;
  @apply pr-3 py-1.5 font-cinzel text-[10px] tracking-wider text-muted-foreground border-b border-border bg-muted/30 items-center;
}

/* INIT = col 2, HP = col 4, AC = col 5 */
.combatant-header span:nth-child(2),
.combatant-header span:nth-child(4),
.combatant-header span:nth-child(5) {
  @apply text-center;
}

.combatant-row {
  display: grid;
  grid-template-columns: 2.5rem 3.5rem 1fr 10rem 3rem 1fr;
  gap: 0.5rem;
  @apply pr-3 py-0 border-b border-border/50 items-stretch relative transition-colors hover:bg-muted/20 cursor-pointer;
}

.combatant-row::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 3px;
  border-radius: 0 2px 2px 0;
  background-color: var(--faction-color);
}

.combatant-row.is-active {
  @apply bg-primary/10 ring-1 ring-primary/20 ring-inset;
}

.combatant-row.is-dead {
  @apply opacity-40;
}

.combatant-row.is-selected {
  @apply bg-muted/40;
}

.avatar-cell {
  align-self: center;
  flex-shrink: 0;
  width: 2.5rem;
  height: 2.5rem;
  overflow: hidden;
  display: flex;
}

.avatar-inner {
  position: relative;
  width: 2.5rem;
  height: 2.5rem;
  overflow: hidden;
  flex-shrink: 0;
}

.avatar-active {
  box-shadow: inset 0 0 0 2px #C9A84C;
}

.avatar-initials {
  @apply w-full h-full flex items-center justify-center font-cinzel text-[11px] font-bold;
}

/* Reveal state overlay button on avatar */
.reveal-btn {
  @apply absolute bottom-0 right-0 flex items-center justify-center w-4 h-4 rounded-tl text-[10px] transition-colors;
}
.reveal-hidden  { @apply bg-muted/80 text-muted-foreground hover:bg-amber-500/80 hover:text-white; }
.reveal-unseen  { @apply bg-amber-500/80 text-white hover:bg-green-500/80; }
.reveal-revealed { @apply bg-green-500/80 text-white hover:bg-muted/80 hover:text-muted-foreground; }

/* re-center all non-avatar cells */
.init-cell,
.name-cell,
.hp-cell,
.ac-cell,
.conditions-cell {
  @apply self-center;
}

.init-cell {
  @apply flex items-center justify-center;
}

.init-input {
  @apply w-10 text-center bg-muted border border-border rounded px-1 py-0.5 font-cinzel text-sm font-bold text-foreground focus:outline-none focus:ring-1 focus:ring-ring;
}

.name-cell {
  @apply flex items-center gap-1.5 min-w-0 flex-wrap cursor-pointer select-none;
}

.combatant-name {
  @apply font-cinzel text-sm font-semibold text-foreground hover:text-primary transition-colors;
}

.type-badge {
  @apply font-cinzel text-[9px] font-bold px-1.5 py-0.5 rounded uppercase;
}

.type-badge.player {
  @apply bg-primary/20 text-primary;
}

.type-badge.monster {
  @apply bg-muted text-muted-foreground;
}

.dead-badge {
  @apply text-destructive text-xs;
}

.wildshape-row-badge {
  @apply font-fell text-[10px] text-amber-400 italic ml-1;
}

.surprised-badge {
  @apply font-cinzel text-[9px] text-amber-500 tracking-wider px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/30 ml-1;
}

.hp-cell {
  @apply flex items-center justify-center gap-1 relative;
}

@keyframes damage-flash {
  0%   { opacity: 1; transform: translateX(-50%) translateY(0); }
  70%  { opacity: 1; transform: translateX(-50%) translateY(-4px); }
  100% { opacity: 0; transform: translateX(-50%) translateY(-10px); }
}

.damage-flash {
  position: absolute;
  top: -0.1rem;
  left: 50%;
  transform: translateX(-50%);
  font-family: var(--font-cinzel);
  font-size: 0.9rem;
  font-weight: 800;
  pointer-events: none;
  animation: damage-flash 10s ease-in forwards;
  z-index: 10;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.6);
  white-space: nowrap;
}

.damage-flash.is-damage {
  @apply text-destructive;
}

.damage-flash.is-heal {
  @apply text-green-500;
}

.hp-btn {
  @apply w-6 h-6 rounded bg-muted border border-border font-cinzel font-bold text-sm flex items-center justify-center hover:bg-card transition-colors;
}

.hp-input {
  @apply w-12 text-center bg-muted border border-border rounded px-1 py-0.5 font-cinzel text-sm font-bold text-foreground focus:outline-none focus:ring-1 focus:ring-ring;
}

.hp-max {
  @apply font-cinzel text-xs text-muted-foreground;
}

.hp-bar-bg {
  @apply absolute bottom-0 left-0 right-0 h-0.5 bg-muted/60 rounded overflow-hidden;
  display: none;
}

.ac-cell {
  @apply flex items-center justify-center;
}

.ac-value {
  @apply font-cinzel text-sm font-bold text-foreground text-center;
}

.conditions-cell {
  @apply flex items-center flex-wrap gap-1;
}

.cond-badge {
  @apply inline-flex items-center px-1.5 py-0.5 rounded font-cinzel text-[9px] font-semibold bg-amber-500/20 text-amber-700 dark:text-amber-400 border border-amber-500/30 cursor-pointer hover:bg-destructive/20 hover:text-destructive transition-colors;
}

.conc-chip {
  @apply inline-flex items-center px-1.5 py-0.5 rounded font-cinzel text-[9px] font-semibold bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 border border-indigo-500/30 cursor-pointer hover:bg-destructive/20 hover:text-destructive transition-colors;
}

.add-cond-btn {
  @apply w-5 h-5 rounded-full border border-dashed border-border text-muted-foreground font-cinzel text-xs flex items-center justify-center hover:border-primary hover:text-primary transition-colors;
}

.cond-picker {
  @apply relative;
}

.cond-select {
  @apply absolute z-10 bg-card border border-border rounded shadow-lg font-fell text-xs text-foreground focus:outline-none;
  min-width: 120px;
  top: 0;
  left: 0;
}

.empty-runner {
  @apply text-center font-fell text-sm text-muted-foreground italic py-16;
}

.combatant-wrap {
  border-bottom: 1px solid theme(colors.border / 50%);
}

.combatant-wrap .combatant-row {
  border-bottom: none;
}

.hp-quick-panel {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.375rem 0.75rem 0.375rem 3rem;
  background: theme(colors.muted / 15%);
  border-top: 1px solid theme(colors.border / 40%);
}

.quick-input {
  width: 3.5rem;
  background: theme(colors.background);
  border: 1px solid theme(colors.border);
  border-radius: 0.25rem;
  padding: 0.2rem 0.4rem;
  font-family: var(--font-cinzel, serif);
  font-size: 11px;
  font-weight: 700;
  text-align: center;
  color: theme(colors.foreground);
  outline: none;
}
.quick-input:focus { border-color: theme(colors.ring); }
.quick-input::-webkit-inner-spin-button,
.quick-input::-webkit-outer-spin-button { -webkit-appearance: none; }

.quick-btn {
  padding: 0.2rem 0.5rem;
  border-radius: 0.25rem;
  font-family: var(--font-cinzel, serif);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.04em;
  border: 1px solid;
  transition: background-color 0.15s;
}

.quick-dmg  { border-color: theme(colors.rose.500 / 40%); color: theme(colors.rose.500); }
.quick-dmg:hover  { background: theme(colors.rose.500 / 15%); }
.quick-heal { border-color: theme(colors.green.500 / 40%); color: theme(colors.green.500); }
.quick-heal:hover { background: theme(colors.green.500 / 15%); }
.quick-temp { border-color: theme(colors.sky.400 / 40%); color: theme(colors.sky.400); }
.quick-temp:hover { background: theme(colors.sky.400 / 15%); }

.quick-temp-display {
  margin-left: auto;
  font-family: var(--font-cinzel, serif);
  font-size: 10px;
  font-weight: 700;
  color: theme(colors.sky.400);
}

/* ── Mobile: card per combatant (separate template path) ──────────────────── */
.mc-card {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.625rem 0.75rem;
  border-bottom: 1px solid theme(colors.border / 50%);
  position: relative;
  cursor: pointer;
  transition: background-color 0.15s;
}

.mc-card::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 3px;
  border-radius: 0 2px 2px 0;
  background-color: var(--faction-color);
}

.mc-card.is-active {
  @apply bg-primary/10 ring-1 ring-primary/20 ring-inset;
}

.mc-card.is-dead {
  @apply opacity-40;
}

.mc-card.is-selected {
  @apply bg-muted/40;
}

.mc-head {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  min-width: 0;
}

.mc-avatar {
  width: 2.5rem;
  height: 2.5rem;
  flex-shrink: 0;
  overflow: hidden;
  display: flex;
}

.mc-identity {
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
  flex: 1;
  min-width: 0;
}

.mc-identity .combatant-name {
  @apply font-cinzel text-sm font-semibold text-foreground;
  /* Keep on one line — badges move to their own row below */
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mc-badges {
  display: flex;
  flex-wrap: wrap;
  gap: 0.375rem;
  align-items: center;
}

.mc-stats {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  /* Indent so the stats visually align past the avatar */
  padding-left: 3.125rem;
  font-family: var(--font-cinzel, serif);
  font-size: 12px;
}

.mc-stat-init,
.mc-stat-hp,
.mc-stat-ac {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
}

.mc-stat-label {
  @apply font-cinzel text-[10px] tracking-wider text-muted-foreground;
}

.mc-stat-value {
  @apply font-cinzel text-sm font-bold text-foreground;
}

.mc-stat-sep {
  @apply text-muted-foreground font-normal mx-0.5;
}

.mc-stat-temp {
  @apply font-cinzel text-[10px] font-bold text-sky-400;
}

.mc-hp-controls {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding-left: 3.125rem;
  position: relative;
}

.hp-btn-lg {
  @apply w-8 h-8 text-base;
}

.hp-input-lg {
  @apply w-16 h-8 text-base;
}

.mc-quick {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding-left: 3.125rem;
  padding-top: 0.25rem;
  border-top: 1px solid theme(colors.border / 30%);
}

.mc-conditions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.375rem;
  padding-left: 3.125rem;
}

/* Surprised toggle — clickable version of the badge */
.surprised-toggle {
  cursor: pointer;
}
.surprised-toggle:hover {
  @apply bg-amber-500/20 border-amber-500/60;
}

/* Unset surprised button — small, low-key */
.surprised-set-btn {
  @apply font-cinzel text-[9px] text-muted-foreground/50 tracking-wider px-1 py-0.5 rounded border border-dashed border-muted-foreground/20 hover:text-amber-500 hover:border-amber-500/40 transition-colors;
}

/* Reaction chip */
.reaction-chip {
  @apply inline-flex items-center px-1.5 py-0.5 rounded font-cinzel text-[9px] font-semibold border transition-colors cursor-pointer;
}
.reaction-ready {
  @apply bg-sky-500/10 text-sky-400 border-sky-500/30 hover:bg-sky-500/20;
}
.reaction-used {
  @apply bg-muted text-muted-foreground/40 border-border line-through hover:bg-rose-500/10 hover:text-rose-400 hover:border-rose-500/30;
}
</style>
