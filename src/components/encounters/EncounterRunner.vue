<template>
  <div class="runner-root">
    <!-- Top bar -->
    <div class="runner-topbar">
      <RouterLink :to="`/encounters/${encounterId}`" class="back-link">
        ← Back to Builder
      </RouterLink>

      <div class="round-controls">
        <button @click="store.prevTurn()" :disabled="!store.started" class="prev-btn">‹</button>
        <span class="round-label">Round {{ store.round }}</span>
        <button @click="store.nextTurn()" :disabled="!store.started" class="next-btn">Next Turn ›</button>
      </div>

      <div class="top-right">
        <span class="encounter-name">{{ store.encounterName }}</span>
        <button v-if="!store.started" @click="store.rollAllInitiatives()" class="roll-btn">
          ⚄ Roll Initiative
        </button>
        <DiceRoller />
        <button @click="handleEndCombat" class="end-btn">End Combat</button>
      </div>
    </div>

    <!-- Body: list + optional detail panel -->
    <div class="runner-body-wrap">
      <!-- Initiative list -->
      <div class="runner-body">
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
          class="combatant-row"
          :class="{
            'is-active': store.started && combatant.instance_id === store.activeCombatant?.instance_id,
            'is-dead': combatant.type === 'monster' && combatant.hp === 0,
            'is-selected': combatant.instance_id === selectedId,
          }"
          :style="{ '--faction-color': factionColor(combatant.faction_id) }"
          @click="toggleDetail(combatant.instance_id)"
        >
          <!-- Avatar -->
          <div class="avatar-cell" @click.stop>
            <img
              v-if="combatantPortrait(combatant)"
              :src="combatantPortrait(combatant)!"
              :alt="combatant.name"
              class="avatar-img"
            />
            <div v-else class="avatar-initials" :style="{ backgroundColor: factionColor(combatant.faction_id) + '44', color: factionColor(combatant.faction_id) }">
              {{ combatantInitials(combatant) }}
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
            <span class="type-badge" :class="combatant.type">{{ combatant.type === 'player' ? 'PC' : 'NPC' }}</span>
            <span v-if="combatant.hp === 0 && combatant.type === 'monster'" class="dead-badge">☠</span>
          </div>

          <!-- HP -->
          <div class="hp-cell" @click.stop>
            <button class="hp-btn" @click="store.adjustHp(combatant.instance_id, -1)">−</button>
            <input
              type="number"
              :value="combatant.hp"
              min="0"
              :max="combatant.max_hp"
              class="hp-input"
              @change="(e) => store.setHp(combatant.instance_id, Number((e.target as HTMLInputElement).value))"
            />
            <span class="hp-max">/ {{ combatant.max_hp }}</span>
            <button class="hp-btn" @click="store.adjustHp(combatant.instance_id, 1)">+</button>
          </div>

          <!-- AC -->
          <div class="ac-cell">
            <span class="ac-value">{{ combatant.ac }}</span>
          </div>

          <!-- Conditions -->
          <div class="conditions-cell" @click.stop>
            <span
              v-for="cond in combatant.conditions"
              :key="cond"
              class="cond-badge"
              @click="store.toggleCondition(combatant.instance_id, cond)"
              title="Click to remove"
            >{{ cond }} ×</span>
            <div class="relative" v-if="addingCondFor !== combatant.instance_id">
              <button class="add-cond-btn" @click="addingCondFor = combatant.instance_id">+</button>
            </div>
            <div v-else class="cond-picker">
              <select
                size="5"
                class="cond-select"
                @change="(e) => { store.toggleCondition(combatant.instance_id, (e.target as HTMLSelectElement).value); addingCondFor = null }"
                @blur="addingCondFor = null"
              >
                <option v-for="c in availableConditions(combatant)" :key="c" :value="c">{{ c }}</option>
              </select>
            </div>
          </div>
        </div>

        <p v-if="!store.sortedCombatants.length" class="empty-runner">
          No combatants. Go back to the builder to add monsters and party members.
        </p>
      </div>

      <!-- Stat block detail panel -->
      <div v-if="selectedCombatant" class="detail-panel">
        <div class="detail-header">
          <span class="detail-name">{{ selectedCombatant.name }}</span>
          <button class="detail-close" @click="selectedId = null">×</button>
        </div>

        <!-- Roll result banner -->
        <Transition name="roll-fade">
          <div v-if="lastCheck" class="roll-result-banner" :class="rollResultClass">
            <div class="roll-result-total">{{ lastCheck.total }}</div>
            <div class="roll-result-info">
              <span class="roll-result-label">{{ lastCheck.label }}</span>
              <span class="roll-result-breakdown">
                <span class="roll-die" :class="{ 'roll-die-drop': lastCheck.dropped !== undefined }">{{ lastCheck.d20 }}</span>
                <span v-if="lastCheck.dropped !== undefined" class="roll-die roll-die-drop">{{ lastCheck.dropped }}</span>
                <span v-if="lastCheck.modifier !== 0" class="roll-mod">{{ lastCheck.modifier >= 0 ? '+' : '' }}{{ lastCheck.modifier }}</span>
              </span>
            </div>
          </div>
        </Transition>

        <!-- Roll mode toggle -->
        <div class="roll-mode-bar">
          <button
            v-for="m in ROLL_MODES"
            :key="m.value"
            type="button"
            class="roll-mode-btn"
            :class="{ 'roll-mode-active': rollMode === m.value, [m.cls]: rollMode === m.value }"
            @click="rollMode = m.value"
          >{{ m.label }}</button>
        </div>

        <!-- Monster -->
        <template v-if="selectedCombatant.type === 'monster' && selectedMonster">
          <div class="detail-scroll">
            <img
              v-if="selectedMonster.image_url"
              :src="selectedMonster.image_url"
              :alt="selectedMonster.name"
              class="detail-portrait"
            />
            <p class="detail-meta">
              {{ selectedMonster.size }} {{ selectedMonster.monster_type
              }}<span v-if="selectedMonster.alignment"> · {{ selectedMonster.alignment }}</span>
            </p>
            <div class="detail-divider" />
            <div class="detail-stats">
              <div class="detail-stat"><span>AC</span><strong>{{ selectedMonster.stat_block?.armor_class }}</strong></div>
              <div class="detail-stat"><span>HP</span><strong>{{ selectedMonster.stat_block?.hit_points }}</strong></div>
              <div class="detail-stat"><span>Speed</span><strong>{{ selectedMonster.stat_block?.speed }}</strong></div>
              <div class="detail-stat"><span>CR</span><strong>{{ selectedMonster.stat_block?.challenge_rating }}</strong></div>
            </div>
            <div class="detail-divider" />
            <!-- Ability scores (clickable mods) -->
            <div class="detail-abilities">
              <button
                v-for="s in ABILITY_KEYS"
                :key="s.key"
                type="button"
                class="detail-ability rollable"
                :title="`Roll ${s.label} check`"
                @click="performCheck(abilityMod(selectedMonster.stat_block?.[s.key] ?? 10), s.label + ' Check')"
              >
                <span>{{ s.label }}</span>
                <strong>{{ selectedMonster.stat_block?.[s.key] ?? '—' }}</strong>
                <em>{{ fmtMod(selectedMonster.stat_block?.[s.key] ?? 10) }}</em>
              </button>
            </div>
            <!-- Monster saves -->
            <template v-if="monsterSaves.length">
              <div class="detail-divider" />
              <p class="detail-section-label">Saving Throws</p>
              <div class="detail-check-grid">
                <button
                  v-for="sv in monsterSaves"
                  :key="sv.label"
                  type="button"
                  class="detail-check-btn"
                  @click="performCheck(sv.bonus, sv.label + ' Save')"
                >
                  <span>{{ sv.label }}</span>
                  <em>{{ sv.bonus >= 0 ? '+' : '' }}{{ sv.bonus }}</em>
                </button>
              </div>
            </template>
            <!-- Monster skills -->
            <template v-if="monsterSkillEntries.length">
              <div class="detail-divider" />
              <p class="detail-section-label">Skills</p>
              <div class="detail-check-grid">
                <button
                  v-for="sk in monsterSkillEntries"
                  :key="sk.label"
                  type="button"
                  class="detail-check-btn"
                  @click="performCheck(sk.bonus, sk.label)"
                >
                  <span>{{ sk.label }}</span>
                  <em>{{ sk.bonus >= 0 ? '+' : '' }}{{ sk.bonus }}</em>
                </button>
              </div>
            </template>
            <template v-if="selectedMonster.stat_block?.senses" >
              <div class="detail-divider" />
              <p class="detail-line"><span>Senses</span>{{ selectedMonster.stat_block.senses }}</p>
            </template>
            <p v-if="selectedMonster.stat_block?.languages" class="detail-line"><span>Languages</span>{{ selectedMonster.stat_block.languages }}</p>
            <p v-if="selectedMonster.stat_block?.damage_resistances" class="detail-line"><span>Resistances</span>{{ selectedMonster.stat_block.damage_resistances }}</p>
            <p v-if="selectedMonster.stat_block?.damage_immunities" class="detail-line"><span>Immunities</span>{{ selectedMonster.stat_block.damage_immunities }}</p>
            <p v-if="selectedMonster.stat_block?.condition_immunities" class="detail-line"><span>Cond. Immune</span>{{ selectedMonster.stat_block.condition_immunities }}</p>
            <template v-for="section in traitSections" :key="section.label">
              <template v-if="section.traits?.length">
                <div class="detail-divider" />
                <p class="detail-section-label">{{ section.label }}</p>
                <div v-for="t in section.traits" :key="t.name" class="detail-trait">
                  <strong>{{ t.name }}.</strong> {{ t.description }}
                </div>
              </template>
            </template>
          </div>
        </template>

        <!-- Player -->
        <template v-else-if="selectedCombatant.type === 'player' && selectedMember">
          <div class="detail-scroll">
            <img
              v-if="selectedMember.portrait_url"
              :src="selectedMember.portrait_url"
              :alt="selectedMember.name"
              class="detail-portrait"
            />
            <p class="detail-meta">
              {{ [selectedMember.race, selectedMember.class].filter(Boolean).join(' · ') }}
              <span v-if="selectedMember.level"> · Level {{ selectedMember.level }}</span>
            </p>
            <div class="detail-divider" />
            <div class="detail-stats">
              <div class="detail-stat"><span>AC</span><strong>{{ selectedMember.ac }}</strong></div>
              <div class="detail-stat"><span>HP</span><strong>{{ selectedMember.current_hp }}/{{ selectedMember.max_hp }}</strong></div>
              <div class="detail-stat"><span>Speed</span><strong>{{ selectedMember.speed }} ft.</strong></div>
              <div class="detail-stat"><span>Prof</span><strong>+{{ playerProfBonus }}</strong></div>
            </div>
            <div class="detail-divider" />
            <!-- Ability scores (clickable mods) -->
            <div class="detail-abilities">
              <button
                v-for="s in ABILITY_KEYS"
                :key="s.key"
                type="button"
                class="detail-ability rollable"
                :title="`Roll ${s.label} check`"
                @click="performCheck(abilityMod(selectedMember[s.key]), s.label + ' Check')"
              >
                <span>{{ s.label }}</span>
                <strong>{{ selectedMember[s.key] }}</strong>
                <em>{{ fmtMod(selectedMember[s.key]) }}</em>
              </button>
            </div>
            <!-- Saving throws -->
            <div class="detail-divider" />
            <p class="detail-section-label">Saving Throws</p>
            <div class="detail-check-grid">
              <button
                v-for="s in ABILITY_KEYS"
                :key="s.key"
                type="button"
                class="detail-check-btn"
                :class="{ 'check-proficient': (selectedMember.saving_throw_proficiencies ?? []).includes(s.key) }"
                @click="performCheck(playerSaveBonus(s.key), s.label + ' Save')"
              >
                <span class="check-label-row">
                  {{ s.label }}
                  <span v-if="(selectedMember.saving_throw_proficiencies ?? []).includes(s.key)" class="prof-pip">P</span>
                </span>
                <em>{{ playerSaveBonus(s.key) >= 0 ? '+' : '' }}{{ playerSaveBonus(s.key) }}</em>
              </button>
            </div>
            <!-- Skills -->
            <div class="detail-divider" />
            <p class="detail-section-label">Skills</p>
            <div class="detail-check-grid">
              <button
                v-for="sk in SKILLS"
                :key="sk.key"
                type="button"
                class="detail-check-btn"
                :class="{ 'check-proficient': playerSkillProf(sk.key) !== 'none', 'check-expertise': playerSkillProf(sk.key) === 'expertise' }"
                @click="performCheck(playerSkillBonus(sk.key, sk.ability), sk.label)"
              >
                <span>{{ sk.label }}</span>
                <em>{{ playerSkillBonus(sk.key, sk.ability) >= 0 ? '+' : '' }}{{ playerSkillBonus(sk.key, sk.ability) }}</em>
              </button>
            </div>
            <template v-if="selectedMember.notes">
              <div class="detail-divider" />
              <p class="detail-notes">{{ selectedMember.notes }}</p>
            </template>
          </div>
        </template>

        <template v-else>
          <div class="detail-scroll">
            <p class="detail-empty">No stat block available.</p>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { useRouter, useRoute } from "vue-router";
import { useEncounterRunStore } from "@/stores/encounterRun";
import { useAllMonsters } from "@/composables/useMonsters";
import { useParty } from "@/composables/useParty";
import { CONDITIONS, SKILLS } from "@/types/party.types";
import type { SaveKey } from "@/types/party.types";
import type { RunCombatant } from "@/types/encounter.types";
import DiceRoller from "@/components/common/DiceRoller.vue";

const store = useEncounterRunStore();
const router = useRouter();
const route = useRoute();
const encounterId = computed(() => route.params.id as string);

const { data: monsters } = useAllMonsters();
const { data: party } = useParty();

const addingCondFor = ref<string | null>(null);
const selectedId = ref<string | null>(null);

// ── Roll check state ──────────────────────────────────────────────────────────

type CheckMode = "normal" | "advantage" | "disadvantage";
const ROLL_MODES: { value: CheckMode; label: string; cls: string }[] = [
  { value: "disadvantage", label: "DIS", cls: "mode-dis" },
  { value: "normal",       label: "Normal", cls: "mode-normal" },
  { value: "advantage",    label: "ADV", cls: "mode-adv" },
];

const rollMode = ref<CheckMode>("normal");

interface CheckResult {
  total: number;
  label: string;
  modifier: number;
  d20: number;
  dropped?: number;
  isCrit: boolean;
  isFumble: boolean;
}
const lastCheck = ref<CheckResult | null>(null);

const rollResultClass = computed(() => {
  if (!lastCheck.value) return "";
  if (lastCheck.value.isCrit) return "roll-crit";
  if (lastCheck.value.isFumble) return "roll-fumble";
  return "";
});

function rollD20(): number {
  return Math.floor(Math.random() * 20) + 1;
}

function performCheck(modifier: number, label: string) {
  const r1 = rollD20();
  if (rollMode.value === "normal") {
    lastCheck.value = {
      total: r1 + modifier,
      label,
      modifier,
      d20: r1,
      isCrit: r1 === 20,
      isFumble: r1 === 1,
    };
  } else {
    const r2 = rollD20();
    const keep = rollMode.value === "advantage" ? Math.max(r1, r2) : Math.min(r1, r2);
    const drop = rollMode.value === "advantage" ? Math.min(r1, r2) : Math.max(r1, r2);
    lastCheck.value = {
      total: keep + modifier,
      label,
      modifier,
      d20: keep,
      dropped: drop,
      isCrit: keep === 20,
      isFumble: keep === 1,
    };
  }
}

// ── Combatant selection ───────────────────────────────────────────────────────

const selectedCombatant = computed(() =>
  store.sortedCombatants.find((c) => c.instance_id === selectedId.value) ?? null,
);

const selectedMonster = computed(() => {
  if (!selectedCombatant.value?.monster_id) return null;
  return monsters.value?.find((m) => m.id === selectedCombatant.value!.monster_id) ?? null;
});

const selectedMember = computed(() => {
  if (!selectedCombatant.value?.party_member_id) return null;
  return party.value?.find((m) => m.id === selectedCombatant.value!.party_member_id) ?? null;
});

// ── Proficiency bonus helpers ─────────────────────────────────────────────────

/** Proficiency bonus for a player — use stored value, fall back to level-based. */
const playerProfBonus = computed(() => {
  const m = selectedMember.value;
  if (!m) return 2;
  if (m.proficiency_bonus) return m.proficiency_bonus;
  const l = m.level;
  if (l >= 17) return 6;
  if (l >= 13) return 5;
  if (l >= 9)  return 4;
  if (l >= 5)  return 3;
  return 2;
});

/** Proficiency bonus for a monster derived from its CR. */
function crToProfBonus(cr: string | null | undefined): number {
  if (!cr) return 2;
  const n = cr === "1/8" ? 0.125 : cr === "1/4" ? 0.25 : cr === "1/2" ? 0.5 : Number(cr);
  if (n >= 29) return 9;
  if (n >= 25) return 8;
  if (n >= 21) return 7;
  if (n >= 17) return 6;
  if (n >= 13) return 5;
  if (n >= 9)  return 4;
  if (n >= 5)  return 3;
  return 2;
}

// ── Monster derived data ──────────────────────────────────────────────────────

/** Parse "Str +4, Dex +2" style saving throws into a lookup map. */
function parseSaveString(s: string): Record<string, number> {
  const result: Record<string, number> = {};
  for (const part of s.split(",")) {
    const m = part.trim().match(/^(\w+)\s+([+-]\d+)$/);
    if (m) result[m[1].toLowerCase()] = Number(m[2]);
  }
  return result;
}

const monsterSaves = computed(() => {
  const sb = selectedMonster.value?.stat_block;
  if (!sb) return [];
  const parsed = sb.saving_throws ? parseSaveString(sb.saving_throws) : {};
  const profBonus = crToProfBonus(sb.challenge_rating);
  return ABILITY_KEYS.map((s) => {
    const base = abilityMod(sb[s.key] ?? 10);
    const bonus = parsed[s.key] !== undefined ? parsed[s.key] : base;
    const hasSave = parsed[s.key] !== undefined;
    return { label: s.label, key: s.key, bonus, proficient: hasSave, profBonus };
  }).filter((sv) => sv.proficient);
});

const monsterSkillEntries = computed(() => {
  const sb = selectedMonster.value?.stat_block;
  if (!sb?.skills) return [];
  return Object.entries(sb.skills).map(([key, val]) => ({
    label: key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
    bonus: Number(val),
  }));
});

const traitSections = computed(() => {
  const sb = selectedMonster.value?.stat_block;
  if (!sb) return [];
  return [
    { label: "Special Abilities", traits: sb.special_abilities },
    { label: "Actions", traits: sb.actions },
    { label: "Bonus Actions", traits: sb.bonus_actions },
    { label: "Reactions", traits: sb.reactions },
    { label: "Legendary Actions", traits: sb.legendary_actions },
    { label: "Lair Actions", traits: sb.lair_actions },
  ];
});

// ── Player derived data ───────────────────────────────────────────────────────

function playerSaveBonus(key: SaveKey): number {
  const m = selectedMember.value;
  if (!m) return 0;
  const base = abilityMod(m[key]);
  const profs: string[] = m.saving_throw_proficiencies ?? [];
  return profs.includes(key) ? base + playerProfBonus.value : base;
}

function playerSkillProf(key: string) {
  return selectedMember.value?.skill_proficiencies?.[key as keyof typeof selectedMember.value.skill_proficiencies] ?? "none";
}

function playerSkillBonus(key: string, ability: SaveKey): number {
  const m = selectedMember.value;
  if (!m) return 0;
  const base = abilityMod(m[ability]);
  const prof = playerSkillProf(key);
  if (prof === "expertise")  return base + playerProfBonus.value * 2;
  if (prof === "proficient") return base + playerProfBonus.value;
  return base;
}

// ── Shared helpers ────────────────────────────────────────────────────────────

const ABILITY_KEYS = [
  { key: "str" as const, label: "STR" },
  { key: "dex" as const, label: "DEX" },
  { key: "con" as const, label: "CON" },
  { key: "int" as const, label: "INT" },
  { key: "wis" as const, label: "WIS" },
  { key: "cha" as const, label: "CHA" },
];

function toggleDetail(instanceId: string) {
  if (selectedId.value === instanceId) {
    selectedId.value = null;
  } else {
    selectedId.value = instanceId;
    lastCheck.value = null;
  }
}

function abilityMod(score: number): number {
  return Math.floor((score - 10) / 2);
}

function fmtMod(score: number): string {
  const m = abilityMod(score);
  return (m >= 0 ? "+" : "") + m;
}

function factionColor(factionId: string): string {
  return store.factions.find((f) => f.id === factionId)?.color ?? "#3D3D3D";
}



function availableConditions(c: RunCombatant): string[] {
  return CONDITIONS.filter((cond) => !c.conditions.includes(cond));
}

function combatantPortrait(c: RunCombatant): string | null {
  if (c.type === "player" && c.party_member_id) {
    return party.value?.find((m) => m.id === c.party_member_id)?.portrait_url ?? null;
  }
  if (c.type === "monster" && c.monster_id) {
    return monsters.value?.find((m) => m.id === c.monster_id)?.image_url ?? null;
  }
  return null;
}

function combatantInitials(c: RunCombatant): string {
  return c.name.split(" ").slice(0, 2).map((w) => w[0] ?? "").join("").toUpperCase();
}

function handleEndCombat() {
  if (confirm("End combat and return to encounter builder?")) {
    store.reset();
    router.push(`/encounters/${encounterId.value}`);
  }
}
</script>

<style scoped>
@reference "@/assets/main.css";

.runner-root {
  @apply flex flex-col h-full min-h-0;
}

.runner-topbar {
  @apply flex items-center gap-4 px-4 py-3 border-b border-border bg-card shrink-0 flex-wrap;
}

.back-link {
  @apply font-cinzel text-xs text-muted-foreground hover:text-foreground transition-colors;
}

.round-controls {
  @apply flex items-center gap-1 ml-auto;
}

.prev-btn {
  @apply px-3 py-1.5 rounded-md border border-border text-foreground font-cinzel text-xs font-semibold hover:bg-muted transition-colors disabled:opacity-40;
}

.next-btn {
  @apply px-4 py-1.5 rounded-md bg-primary text-primary-foreground font-cinzel text-xs font-semibold hover:opacity-90 disabled:opacity-40;
}

.round-label {
  @apply font-cinzel text-sm font-bold text-foreground px-2;
}

.top-right {
  @apply flex items-center gap-2;
}

.encounter-name {
  @apply font-cinzel text-sm font-bold text-foreground hidden sm:block;
}

.roll-btn {
  @apply inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-primary-foreground font-cinzel text-xs font-semibold hover:opacity-90 transition-opacity;
}

.end-btn {
  @apply inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-destructive/40 text-destructive font-cinzel text-xs font-semibold hover:bg-destructive/10 transition-colors;
}

.runner-body-wrap {
  @apply flex flex-1 min-h-0 overflow-hidden;
}

.runner-body {
  @apply flex-1 overflow-y-auto min-w-0;
}

.combatant-header {
  display: grid;
  grid-template-columns: 2.5rem 3.5rem 1fr 10rem 3rem 1fr;
  gap: 0.5rem;
  @apply pl-1 pr-3 py-1.5 font-cinzel text-[10px] tracking-wider text-muted-foreground border-b border-border bg-muted/30 items-center;
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
  @apply pl-1 pr-3 py-0 border-b border-border/50 items-stretch relative transition-colors hover:bg-muted/20 cursor-pointer;
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
  align-self: stretch;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 3rem;
}

.avatar-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center top;
  display: block;
}

.avatar-initials {
  @apply w-full h-full flex items-center justify-center font-cinzel text-[11px] font-bold;
}

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

.hp-cell {
  @apply flex items-center justify-center gap-1 relative;
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

/* ── Detail panel ─────────────────────────────────────────────────────────── */

.detail-panel {
  @apply w-80 shrink-0 border-l border-border bg-card flex flex-col overflow-hidden;
}

.detail-header {
  @apply flex items-center justify-between px-3 py-2 border-b border-border shrink-0;
}

.detail-name {
  @apply font-cinzel text-sm font-bold text-foreground truncate;
}

.detail-close {
  @apply text-muted-foreground hover:text-foreground transition-colors text-xl leading-none shrink-0 ml-2;
}

/* Roll result banner */
.roll-result-banner {
  @apply flex items-center gap-3 px-3 py-2 border-b border-border bg-muted/30 shrink-0;
}
.roll-result-total {
  @apply font-cinzel text-2xl font-bold text-foreground min-w-10 text-center;
}
.roll-crit .roll-result-total   { @apply text-amber-500; }
.roll-fumble .roll-result-total { @apply text-destructive; }
.roll-result-info {
  @apply flex flex-col;
}
.roll-result-label {
  @apply font-cinzel text-[10px] font-bold tracking-wider text-muted-foreground uppercase;
}
.roll-result-breakdown {
  @apply flex items-center gap-1 flex-wrap;
}
.roll-die {
  @apply font-cinzel text-xs font-bold text-foreground bg-muted rounded px-1.5 py-0.5;
}
.roll-die-drop {
  @apply line-through opacity-40;
}
.roll-mod {
  @apply font-cinzel text-xs text-primary font-semibold;
}

/* Roll mode bar */
.roll-mode-bar {
  @apply flex border-b border-border shrink-0;
}
.roll-mode-btn {
  @apply flex-1 py-1.5 font-cinzel text-[10px] font-bold tracking-wider text-muted-foreground hover:text-foreground transition-colors;
}
.roll-mode-active { @apply text-foreground; }
.mode-dis.roll-mode-active   { @apply bg-destructive/10 text-destructive; }
.mode-normal.roll-mode-active { @apply bg-muted/50 text-foreground; }
.mode-adv.roll-mode-active   { @apply bg-green-500/10 text-green-600 dark:text-green-400; }

.detail-scroll {
  @apply flex-1 overflow-y-auto p-3 flex flex-col gap-2;
}

.detail-portrait {
  @apply w-full rounded-md object-cover mb-1;
  max-height: 200px;
}

.detail-meta {
  @apply font-fell text-xs text-muted-foreground italic capitalize;
}

.detail-divider {
  @apply border-t border-border/60 my-1;
}

.detail-stats {
  @apply grid grid-cols-2 gap-1;
}

.detail-stat {
  @apply flex flex-col bg-muted/40 rounded px-2 py-1;
}

.detail-stat span {
  @apply font-cinzel text-[9px] tracking-wider text-muted-foreground uppercase;
}

.detail-stat strong {
  @apply font-cinzel text-sm font-bold text-foreground;
}

.detail-abilities {
  @apply grid grid-cols-3 gap-1;
}

.detail-ability {
  @apply flex flex-col items-center bg-muted/40 rounded px-1 py-1.5;
}

.detail-ability span {
  @apply font-cinzel text-[9px] tracking-wider text-muted-foreground uppercase;
}

.detail-ability strong {
  @apply font-cinzel text-sm font-bold text-foreground;
}

.detail-ability em {
  @apply font-cinzel text-[10px] not-italic text-muted-foreground;
}

/* Rollable cells */
.rollable {
  @apply cursor-pointer hover:bg-primary/10 hover:border-primary/30 border border-transparent transition-colors;
}
.rollable:active {
  @apply scale-95;
}

/* Check grid (saves / skills) */
.detail-check-grid {
  @apply grid grid-cols-2 gap-1;
}

.detail-check-btn {
  @apply flex items-center justify-between bg-muted/30 rounded px-2 py-1 hover:bg-primary/10 hover:border-primary/30 border border-transparent transition-colors cursor-pointer;
}
.detail-check-btn span {
  @apply font-cinzel text-[9px] tracking-wider text-muted-foreground uppercase truncate;
}
.check-label-row {
  @apply flex items-center gap-0.5;
}
.prof-pip {
  @apply font-cinzel text-[8px] font-bold text-primary bg-primary/15 rounded px-0.5 leading-none py-0.5;
}
.detail-check-btn em {
  @apply font-cinzel text-xs font-bold not-italic text-foreground shrink-0 ml-1;
}
.check-proficient {
  @apply border-l-2 border-l-primary/60;
}
.check-expertise {
  @apply border-l-2 border-l-amber-500/80;
}

.detail-section-label {
  @apply font-cinzel text-[10px] font-bold tracking-wider text-muted-foreground uppercase mt-1;
}

.detail-trait {
  @apply font-fell text-xs text-foreground leading-relaxed;
}

.detail-line {
  @apply font-fell text-xs text-foreground;
}

.detail-line span {
  @apply font-cinzel text-[9px] font-bold tracking-wider text-muted-foreground uppercase mr-1;
}

.detail-notes {
  @apply font-fell text-xs text-muted-foreground italic;
}

.detail-empty {
  @apply font-fell text-sm text-muted-foreground italic text-center py-8;
}

/* Transitions */
.roll-fade-enter-active,
.roll-fade-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}
.roll-fade-enter-from,
.roll-fade-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>
