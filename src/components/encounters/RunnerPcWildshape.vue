<template>
  <div class="detail-divider" />

  <!-- Active wildshape banner -->
  <template v-if="combatant.wildshape">
    <div class="wildshape-banner">
      <span class="wildshape-banner-label">🐺 {{ combatant.wildshape.beast_name }}</span>
      <div class="flex items-center gap-1.5">
        <button
          v-if="isDruid"
          type="button"
          class="wildshape-revert-btn"
          @click="showWildshapePicker = !showWildshapePicker"
        >{{ showWildshapePicker ? 'Cancel' : 'Change' }}</button>
        <button
          type="button"
          class="wildshape-revert-btn"
          @click="emit('revert-wildshape')"
        >Revert</button>
      </div>
    </div>
    <template v-if="wildshapeMonster">
      <p class="detail-meta mt-1">{{ wildshapeMonster.size }} {{ wildshapeMonster.monster_type }}</p>
      <div class="detail-stats mt-2">
        <div class="detail-stat"><span>AC</span><strong>{{ combatant.wildshape!.beast_ac }}</strong></div>
        <div class="detail-stat"><span>HP</span><strong>{{ combatant.wildshape!.beast_hp }}/{{ combatant.wildshape!.beast_max_hp }}</strong></div>
        <div class="detail-stat"><span>Speed</span><strong>{{ wildshapeMonster.stat_block?.speed }}</strong></div>
      </div>
      <div class="detail-divider" />
      <AbilityScoreTable
        :scores="wildshapeScores"
        :saves="wildshapeSaves"
        :rounded="false"
        @roll-ability="(_, label, mod) => emit('roll-check', mod, label + ' Check')"
        @roll-save="(_, label, bonus) => emit('roll-check', bonus, label + ' Save')"
      />
      <RunnerTraitSection
        :sections="wildshapeTraitSections"
        @roll-attack="(bonus, name) => emit('roll-attack', bonus, name)"
        @roll-damage="(desc, name) => emit('roll-damage', desc, name)"
      />
    </template>
  </template>

  <!-- Wildshape picker (Druid not wildshaped OR "Change" clicked) -->
  <template v-if="isDruid && !combatant.wildshape">
    <div class="flex items-center justify-between">
      <p class="detail-section-label">Wildshape</p>
      <div class="flex items-center gap-1.5">
        <span class="font-fell text-[10px] text-muted-foreground">Max CR {{ wildshapeCrDisplay }}</span>
        <span v-if="isCircleOfMoon" class="font-cinzel text-[9px] tracking-wider px-1 py-0.5 rounded border border-primary/40 text-primary bg-primary/10">MOON</span>
        <button
          type="button"
          class="font-cinzel text-[10px] px-2 py-1 rounded border border-border hover:border-primary hover:text-primary transition-colors"
          @click="showWildshapePicker = !showWildshapePicker"
        >{{ showWildshapePicker ? 'Cancel' : '🐺 Choose Form' }}</button>
      </div>
    </div>
  </template>
  <template v-if="showWildshapePicker && isDruid">
    <p v-if="!wildshapeForms.length" class="font-fell text-xs text-muted-foreground italic px-1 py-2">
      No eligible beast forms at this level.
    </p>
    <div v-else class="wildshape-picker-list">
      <button
        v-for="m in wildshapeForms"
        :key="m.id"
        type="button"
        class="wildshape-pick-row"
        @click="emit('enter-wildshape', m)"
      >
        <span class="pick-name">{{ m.name }}</span>
        <span class="pick-cr">CR {{ m.stat_block?.challenge_rating }}</span>
        <span class="pick-ac">AC {{ m.stat_block?.armor_class }}</span>
        <span class="pick-speed">{{ m.stat_block?.speed }}</span>
      </button>
    </div>
  </template>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import AbilityScoreTable from "@/components/common/AbilityScoreTable.vue";
import RunnerTraitSection from "@/components/encounters/RunnerTraitSection.vue";
import type { PartyMember } from "@/types/party.types";
import type { RunCombatant } from "@/types/encounter.types";
import type { Monster } from "@/types/monster.types";
import { useDiscoveredKeys } from "@/composables/useDiscoveredMonsters";
import { useDmPinnedForms } from "@/composables/usePinnedForms";
import { parseCr } from "@/lib/utils";

const { combatant, member, monsters } = defineProps<{
  combatant: RunCombatant;
  member: PartyMember;
  monsters: Monster[];
}>();

const emit = defineEmits<{
  "roll-check": [modifier: number, label: string];
  "roll-attack": [bonus: number, name: string];
  "roll-damage": [desc: string, name: string];
  "revert-wildshape": [];
  "enter-wildshape": [monster: Monster];
}>();

// ── Composables ───────────────────────────────────────────────────────────────

const discoveredKeys = useDiscoveredKeys();
const memberId = computed(() => member.id);
const { data: pinnedForms } = useDmPinnedForms(memberId);

// ── Class helpers ─────────────────────────────────────────────────────────────

const isDruid = computed(() =>
  (member.class as string | null)?.toLowerCase().includes("druid") ?? false,
);

const isCircleOfMoon = computed(() =>
  member.subclass?.toLowerCase().includes("moon") ?? false,
);

// ── Wildshape eligibility ─────────────────────────────────────────────────────

const wildshapeMaxCr = computed(() => {
  const level = member.level ?? 1;
  if (isCircleOfMoon.value) return Math.max(1, Math.floor(level / 3));
  return Math.max(0.125, Math.floor(level / 2) * 0.5);
});

const wildshapeCrDisplay = computed(() => {
  const cr = wildshapeMaxCr.value;
  if (cr === 0.125) return "1/8";
  if (cr === 0.25)  return "1/4";
  if (cr === 0.5)   return "1/2";
  return String(cr);
});

const pinnedKeys = computed<Set<string>>(() =>
  new Set((pinnedForms.value ?? []).map((p) => p.monster_id ?? p.srd_slug ?? "").filter(Boolean)),
);

const wildshapeForms = computed<Monster[]>(() => {
  if (!isDruid.value) return [];
  const level = member.level ?? 1;
  const maxCr = wildshapeMaxCr.value;
  const dkeys = discoveredKeys.value;
  return monsters
    .filter((m) => {
      if (!dkeys.has(m.id) && !pinnedKeys.value.has(m.id)) return false;
      if ((m.monster_type ?? "").toLowerCase() !== "beast") return false;
      if (parseCr(m.stat_block?.challenge_rating) > maxCr) return false;
      if (level < 8) {
        const speed = (m.stat_block?.speed ?? "").toLowerCase();
        if (speed.includes("fly") || speed.includes("swim")) return false;
      }
      return true;
    })
    .sort((a, b) => parseCr(a.stat_block?.challenge_rating) - parseCr(b.stat_block?.challenge_rating));
});

// ── Active wildshape stats ────────────────────────────────────────────────────

const showWildshapePicker = ref(false);

const wildshapeMonster = computed<Monster | null>(() => {
  const ws = combatant.wildshape;
  if (!ws) return null;
  return monsters.find((m) => m.id === ws.monster_id) ?? null;
});

const ABILITY_KEYS = [
  { key: "str" as const, label: "STR" },
  { key: "dex" as const, label: "DEX" },
  { key: "con" as const, label: "CON" },
  { key: "int" as const, label: "INT" },
  { key: "wis" as const, label: "WIS" },
  { key: "cha" as const, label: "CHA" },
];

function abilityMod(score: number): number {
  return Math.floor((score - 10) / 2);
}

function parseSaveString(s: string): Record<string, number> {
  const result: Record<string, number> = {};
  for (const part of s.split(",")) {
    const m = part.trim().match(/^(\w+)\s+([+-]\d+)$/);
    if (m) result[m[1].toLowerCase()] = Number(m[2]);
  }
  return result;
}

const wildshapeScores = computed(() => {
  const sb = wildshapeMonster.value?.stat_block;
  return {
    str: sb?.str ?? 10, dex: sb?.dex ?? 10, con: sb?.con ?? 10,
    int: sb?.int ?? 10, wis: sb?.wis ?? 10, cha: sb?.cha ?? 10,
  };
});

const wildshapeSaves = computed<Record<string, import("@/components/common/AbilityScoreTable.vue").SaveEntry>>(() => {
  const sb = wildshapeMonster.value?.stat_block;
  const parsed = sb?.saving_throws ? parseSaveString(sb.saving_throws) : {};
  return Object.fromEntries(
    ABILITY_KEYS.map((s) => {
      const base = abilityMod(sb?.[s.key] ?? 10);
      return [s.key, { bonus: parsed[s.key] ?? base, proficient: s.key in parsed }];
    }),
  );
});

const wildshapeTraitSections = computed(() => {
  const sb = wildshapeMonster.value?.stat_block;
  if (!sb) return [];
  return [
    { label: "Special Abilities", traits: sb.special_abilities },
    { label: "Actions", traits: sb.actions },
    { label: "Bonus Actions", traits: sb.bonus_actions },
    { label: "Reactions", traits: sb.reactions },
    { label: "Legendary Actions", traits: sb.legendary_actions },
  ];
});
</script>

<style scoped>
@reference "@/assets/main.css";

.detail-divider {
  @apply border-t border-border/60 my-1;
}

.detail-meta {
  @apply font-fell text-xs text-muted-foreground italic capitalize;
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

.detail-section-label {
  @apply font-cinzel text-[10px] font-bold tracking-wider text-muted-foreground uppercase mt-1;
}

.wildshape-banner {
  @apply flex items-center justify-between gap-2 rounded-md bg-amber-500/10 border border-amber-500/30 px-3 py-2;
}

.wildshape-banner-label {
  @apply font-cinzel text-xs font-semibold text-amber-400;
}

.wildshape-revert-btn {
  @apply font-cinzel text-[10px] px-2 py-1 rounded border border-amber-500/40 text-amber-400 hover:bg-amber-500/10 transition-colors shrink-0;
}

.wildshape-picker-list {
  @apply flex flex-col gap-0.5 max-h-52 overflow-y-auto rounded border border-border;
}

.wildshape-pick-row {
  @apply flex items-center gap-2 px-2 py-1.5 text-left hover:bg-muted/60 transition-colors cursor-pointer;
}

.pick-name {
  @apply font-fell text-xs text-foreground flex-1 truncate;
}

.pick-cr {
  @apply font-cinzel text-[10px] text-muted-foreground shrink-0;
}

.pick-ac {
  @apply font-cinzel text-[10px] text-muted-foreground shrink-0;
}

.pick-speed {
  @apply font-fell text-[10px] text-muted-foreground shrink-0 truncate max-w-24 hidden sm:block;
}
</style>
