<template>
  <div v-if="c" class="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4" data-testid="play-turn-card">
    <header class="flex items-center gap-3">
      <!-- The oxblood ring is the turn, as the bookmark edge is in the initiative column. -->
      <span class="shrink-0 rounded-full p-0.5 ring-2" style="--tw-ring-color: var(--live-ink, var(--color-primary))">
        <PlayPortrait :combatant="c" :factions="store.factions" />
      </span>
      <div class="min-w-0">
        <p class="text-eyebrow uppercase text-muted-foreground">Whose turn</p>
        <h2 class="truncate text-heading-sm font-bold text-foreground">{{ c.name }}</h2>
        <p class="text-caption text-muted-foreground" data-testid="turn-card-line">
          <span v-if="descriptor">{{ descriptor }} · </span>AC {{ c.ac }} · {{ c.hp }} / {{ c.max_hp }} HP<template v-for="cond in c.conditions" :key="cond.name"> · <span class="text-tone-caution">{{ cond.name }}</span></template>
        </p>
      </div>
    </header>

    <section aria-labelledby="turn-move">
      <div class="flex items-baseline justify-between gap-2">
        <h3 id="turn-move" class="text-label-lg font-bold text-foreground">1 · Move</h3>
        <AppButton variant="ghost" size="sm" :icon="IconUndo" label="Back to start" :disabled="!canUndo" @click="emit('back-to-start')" />
      </div>
      <p class="mt-1 text-body text-foreground" data-testid="turn-card-moving">
        <template v-if="speed !== null">Moving {{ used }} of {{ speed }} ft</template>
        <template v-else>Moved {{ used }} ft · Speed unknown</template>
      </p>
      <template v-if="speed !== null && bar">
        <!-- Two speeds long: gilt is what has been moved, the plain half is the speed, the dashed half a Dash. -->
        <div class="relative mt-2 h-2.5 overflow-hidden rounded-full border border-border bg-secondary" role="img" :aria-label="`Moved ${used} of ${speed} feet`">
          <span class="dash-half absolute inset-y-0 right-0" :style="{ left: bar.dashFrom * 100 + '%' }"></span>
          <span class="gilt absolute inset-y-0 left-0" :style="{ width: bar.moved * 100 + '%' }"></span>
        </div>
        <p class="mt-1 text-caption text-muted-foreground">Gilt: moved · then speed · dashed: a Dash</p>
      </template>
    </section>

    <section aria-labelledby="turn-act">
      <div class="flex items-baseline justify-between gap-2">
        <h3 id="turn-act" class="text-label-lg font-bold text-foreground">2 · Act</h3>
        <p v-if="nextTo" class="text-caption text-muted-foreground" data-testid="turn-card-next-to">next to {{ nextTo }}</p>
      </div>
      <div class="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="Spent this turn">
        <AppButton
          v-for="chip in chips"
          :key="chip.label"
          :variant="chip.used ? 'ghost' : 'tinted'"
          :tone="chip.used ? undefined : 'success'"
          size="sm"
          :label="chip.label"
          :aria-pressed="chip.used"
          :class="chip.used ? 'line-through opacity-60' : ''"
          :tooltip="chip.used ? `${chip.label} spent. Click to take it back` : `Click to mark the ${chip.label.toLowerCase()} spent`"
          @click="chip.toggle"
        />
      </div>

      <RunnerActionList v-if="sections.length > 0" :combatant="c" :sections="sections" class="mt-2" />
      <PlayPcAttacks v-else-if="member" :key="member.id" class="mt-2" :member="member" :sender-name="c.name" />
      <p v-else-if="c.type === 'player'" class="mt-2 text-caption text-muted-foreground">Their attacks and spells are on the full sheet.</p>

      <label class="mt-3 flex items-center gap-2 text-caption text-muted-foreground">
        <span>Size (Enlarge or Reduce)</span>
        <AppSelect
          :model-value="sizeOverride"
          size="sm"
          aria-label="Size for this fight"
          @update:model-value="onSize"
        >
          <option value="">{{ ownSizeLabel }}</option>
          <option v-for="size in MONSTER_SIZES" :key="size" :value="size" class="capitalize">{{ size }}</option>
        </AppSelect>
      </label>
    </section>

    <section aria-labelledby="turn-next">
      <h3 id="turn-next" class="text-label-lg font-bold text-foreground">3 · Next turn</h3>
      <p class="mt-1 text-caption text-muted-foreground" data-testid="turn-card-handoff">
        Damage and healing land on whoever is selected on the map or in the list, not only on {{ c.name }}.
        <template v-if="next">Next turn moves the card to {{ next.name }}.</template>
      </p>
      <AppButton class="mt-2" variant="primary" size="md" :icon="IconChevronRight" label="Next turn" @click="store.nextTurn()" />
    </section>

    <AppButton class="self-start" variant="link" size="inline" label="Open the full sheet" @click="emit('open-sheet')" />
  </div>
</template>

<script setup lang="ts">
import { computed, provide, ref } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppSelect from "@/components/common/controls/AppSelect.vue";
import { IconChevronRight, IconUndo } from "@/lib/icons";
import { RUNNER_ROLL_CONTEXT } from "@/components/encounters/runnerResolve";
import RunnerActionList from "@/components/encounters/RunnerActionList.vue";
import { useEncounterRunStore } from "@/stores/encounterRun";
import { MONSTER_SIZES } from "@/types/monster.types";
import type { RollMode } from "@/lib/dice/dice";
import type { PartyMember } from "@/types/party.types";
import PlayPcAttacks from "./PlayPcAttacks.vue";
import PlayPortrait from "./PlayPortrait.vue";
import { adjacentFoes, movementUsedOf } from "./playRoster";
import { combatantSpeed, moveBarShares } from "./playSpeed";

/**
 * The right column while it is a combatant's turn (#1125 decision 10, frame 10): read top to bottom, move, act,
 * hand over. It reads and marks the runner's store directly, like the sheet it sits beside, so the map and the
 * list need tell it nothing. A turn is one combatant's, so this shows the active one whatever else is selected.
 */
const { partyMembers = [] } = defineProps<{ partyMembers?: readonly PartyMember[] }>();
const emit = defineEmits<{ "back-to-start": []; "open-sheet": [] }>();

const store = useEncounterRunStore();
const c = computed(() => store.activeCombatant);

// The action list rolls with the DM's mode and chat setting; the card has no toggles of its own, so it rolls plain and public.
provide(RUNNER_ROLL_CONTEXT, { rollMode: ref<RollMode>("normal"), silent: computed(() => false) });

const monster = computed(() => store.availableMonsters.find((m) => m.id === c.value?.monster_id) ?? null);
const npc = computed(() => store.availableNpcs.find((n) => n.id === c.value?.npc_id) ?? null);
const member = computed(() => partyMembers.find((m) => m.id === c.value?.party_member_id) ?? null);

const descriptor = computed(() => {
  if (member.value) return [member.value.class, member.value.level].filter((part) => part !== null && part !== "").join(" ");
  if (monster.value) return `${monster.value.size.charAt(0).toUpperCase()}${monster.value.size.slice(1)} ${monster.value.monster_type}`;
  return npc.value ? "NPC" : "";
});
const ownSizeLabel = computed(() => {
  const own = c.value?.size ?? monster.value?.size;
  return own ? `Own size (${own})` : "Own size";
});

const sizeOverride = computed(() => (c.value?.size_override ? c.value.size_override : ""));
const speed = computed(() => (c.value ? combatantSpeed(c.value, { monsters: store.availableMonsters, npcs: store.availableNpcs, members: partyMembers }) : null));
const used = computed(() => movementUsedOf(c.value ?? undefined));
// No known speed means no bar: a bar against 0 would read as full.
const bar = computed(() => (speed.value === null ? null : moveBarShares(used.value, speed.value)));
const canUndo = computed(() => {
  const history = c.value ? store.moveHistory[c.value.instance_id] : undefined;
  return history !== undefined && history.length > 0;
});

const nextTo = computed(() => {
  if (!c.value) return "";
  const foes = adjacentFoes(c.value, store.combatants, store.factions, store.availableMonsters).map((f) => f.name);
  if (foes.length <= 2) return foes.join(" and ");
  return `${foes[0]} and ${foes.length - 1} more`;
});

const next = computed(() => {
  const order = store.sortedCombatants;
  return order.length > 1 ? order[(store.activeIndex + 1) % order.length] : null;
});

const chips = computed(() => {
  const id = c.value?.instance_id;
  if (!c.value || !id) return [];
  return [
    { label: "Action", used: !!c.value.action_used, toggle: () => store.setActionUsed(id, !c.value?.action_used) },
    { label: "Bonus action", used: !!c.value.bonus_used, toggle: () => store.setBonusUsed(id, !c.value?.bonus_used) },
    { label: "Reaction", used: !!c.value.reactionUsed, toggle: () => store.toggleReaction(id) },
  ];
});

// The attacks to roll: a stat block's Actions and Bonus Actions. A character's are on the full sheet.
const sections = computed(() => {
  const sb = monster.value?.stat_block ?? npc.value?.stat_block;
  if (!sb) return [];
  return [
    { label: "Actions", list: "actions" as const, entries: sb.actions },
    { label: "Bonus Actions", list: "bonus_actions" as const, entries: sb.bonus_actions },
  ].filter((s) => s.entries && s.entries.length > 0);
});

function onSize(value: string | number | null | undefined) {
  const id = c.value?.instance_id;
  if (!id) return;
  const size = MONSTER_SIZES.find((s) => s === value);
  store.setSizeOverride(id, size ?? null);
}
</script>

<style scoped>
.gilt {
  background: #c9a227;
}

.dash-half {
  background: repeating-linear-gradient(135deg, transparent 0 0.25rem, color-mix(in oklab, var(--color-muted-foreground), transparent 55%) 0.25rem 0.375rem);
}
</style>
