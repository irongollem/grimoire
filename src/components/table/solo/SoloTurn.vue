<template>
  <!-- Frames 12 and 13: the top of the left column on your turn, "in the order a turn goes: move, act, end". -->
  <section class="flex flex-col gap-4 border-b border-border px-4 py-3.5" aria-label="Your turn" data-testid="solo-turn">
    <header class="flex flex-col gap-1.5">
      <div class="flex items-baseline justify-between gap-2">
        <h2 class="text-heading-sm font-bold text-primary">Your turn</h2>
        <span class="text-caption text-muted-foreground">Round {{ round }}</span>
      </div>
      <div class="flex items-baseline gap-1.5" :aria-label="`Hit points ${hp.hp} of ${hp.maxHp}`">
        <span class="text-heading-sm font-bold tabular-nums">{{ hp.hp }}</span>
        <span class="text-caption text-muted-foreground">of {{ hp.maxHp }}</span>
      </div>
      <div class="h-1.5 overflow-hidden rounded-full bg-muted" role="meter" aria-label="Hit points" :aria-valuenow="hp.hp" aria-valuemin="0" :aria-valuemax="hp.maxHp">
        <div class="h-full rounded-full bg-primary" :style="{ width: `${hpPct}%` }" />
      </div>
    </header>

    <div class="flex flex-col gap-1.5">
      <div class="flex items-baseline justify-between gap-2">
        <span class="text-eyebrow text-muted-foreground">1 · Move</span>
        <span class="text-caption font-semibold tabular-nums">{{ movedFeet }} of {{ speedFeet }} ft</span>
      </div>
      <div class="h-1.5 overflow-hidden rounded-full bg-muted" role="meter" aria-label="Movement used" :aria-valuenow="movedFeet" aria-valuemin="0" :aria-valuemax="speedFeet">
        <div class="h-full rounded-full bg-tone-info" :style="{ width: `${movePct}%` }" />
      </div>
      <p class="text-caption text-muted-foreground">Click a square on the map, or drag your token.</p>
    </div>

    <div class="flex flex-col gap-2">
      <span class="text-eyebrow text-muted-foreground">2 · Act</span>
      <!-- What the turn has left. A spent one is struck through and muted, so the list is read at a glance. -->
      <ul class="flex flex-wrap gap-1.5" aria-label="What this turn has left">
        <li
          v-for="chip in chips"
          :key="chip.label"
          class="rounded-full border border-border px-2 py-0.5 text-caption"
          :class="chip.left ? 'text-foreground' : 'text-muted-foreground line-through opacity-60'"
        >
          {{ chip.label }}<span class="sr-only">{{ chip.left ? " (left)" : " (spent)" }}</span>
        </li>
      </ul>

      <ul v-if="attacks.length > 0" class="flex flex-col gap-1.5">
        <li v-for="row in attacks" :key="row.key" class="flex items-center justify-between gap-2 rounded-md border border-border px-2.5 py-1.5">
          <div class="min-w-0">
            <p class="truncate text-label-lg font-semibold text-foreground">{{ row.name }}</p>
            <p v-if="attackSummary(row) !== ''" class="text-caption text-muted-foreground">{{ attackSummary(row) }}</p>
          </div>
          <!-- A custom attack with no bonus has nothing to roll, so it is listed without a button. -->
          <AppButton
            v-if="row.attackBonus !== null"
            :variant="armedKey === row.key ? 'live' : 'primary'"
            size="sm"
            :label="armedKey === row.key ? 'Pick a target…' : 'Attack'"
            :aria-label="`Attack with ${row.name}`"
            :active="armedKey === row.key"
            :aria-pressed="armedKey === row.key"
            :disabled="busy || !budget.action"
            @click="pressAttack(row)"
          />
        </li>
      </ul>

      <!-- Weapons carried but not in hand. Drawing one is the turn's free interaction, once (PHB 2014 ch. 9). -->
      <div v-if="carriedWeapons.length > 0" class="flex flex-col gap-1.5" data-testid="solo-carried">
        <span class="text-eyebrow text-muted-foreground">Carried</span>
        <p v-if="!budget.smallThing" class="text-caption text-muted-foreground">You have already handled one thing this turn.</p>
        <ul class="flex flex-col gap-1.5">
          <li v-for="w in carriedWeapons" :key="w.id" class="flex items-center justify-between gap-2 rounded-md border border-border px-2.5 py-1.5">
            <p class="min-w-0 truncate text-label-lg font-semibold text-foreground">{{ w.name }}</p>
            <AppButton variant="outline" size="sm" label="Draw" :aria-label="`Draw ${w.name}`" :disabled="busy || !budget.smallThing" @click="emit('draw', w.id)" />
          </li>
        </ul>
      </div>

      <div class="grid grid-cols-2 gap-1.5">
        <AppButton v-for="a in ACTIONS" :key="a.kind" variant="outline" size="sm" :label="a.label" :disabled="busy || !budget.action" @click="emit('act', a.kind)" />
      </div>
      <p class="text-caption text-muted-foreground">Anything else: say it or do it in the story below. It is paid from the same turn.</p>
    </div>

    <AppButton variant="live" size="md" block label="End my turn" :disabled="busy" @click="emit('end')" />
  </section>
</template>

<script setup lang="ts">
import { computed } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import { attackSummary } from "@/lib/table/solo/fight/attackLabel";
import { usePcAttackRows } from "@/composables/encounters/usePcAttackRows";
import type { PcAttackRow } from "@/types/pcAttack.types";
import type { TurnBudget } from "@/lib/table/solo/fight/turnBudget";
import type { PartyMember } from "@/types/party.types";

type ActKind = "dash" | "dodge" | "disengage" | "hide";
const ACTIONS: { kind: ActKind; label: string }[] = [
  { kind: "dash", label: "Dash" },
  { kind: "dodge", label: "Dodge" },
  { kind: "disengage", label: "Disengage" },
  { kind: "hide", label: "Hide" },
];

/**
 * The played character's turn controls. Attacks are offered while the Action is available; a weapon that the rules make a
 * Bonus Action cannot be told from the row, so only `budget.action` gates them. Every control is off while `busy`.
 */
const { member, round, hp, speedFeet, movedFeet, budget, armedKey, busy } = defineProps<{
  member: PartyMember;
  round: number;
  hp: { hp: number; maxHp: number };
  speedFeet: number;
  movedFeet: number;
  budget: TurnBudget;
  /** The `key` of the attack whose target is being chosen, or null. */
  armedKey: string | null;
  busy: boolean;
}>();
const emit = defineEmits<{
  attack: [row: PcAttackRow];
  act: [kind: ActKind];
  end: [];
  cancelAttack: [];
  /** Draw the carried weapon whose inventory row has this id. */
  draw: [rowId: string];
}>();

const { all: attacks, carriedWeapons } = usePcAttackRows(() => member);

const pct = (n: number, of: number) => (of > 0 ? Math.min(100, Math.max(0, (n / of) * 100)) : 0);
const hpPct = computed(() => pct(hp.hp, hp.maxHp));
const movePct = computed(() => pct(movedFeet, speedFeet));

const chips = computed(() => [
  { label: "Action", left: budget.action },
  { label: "Bonus", left: budget.bonus },
  { label: "Reaction", left: budget.reaction },
  { label: "A few words", left: budget.words },
  { label: "One small thing", left: budget.smallThing },
]);

function pressAttack(row: PcAttackRow): void {
  if (busy) return;
  if (armedKey === row.key) emit("cancelAttack");
  else emit("attack", row);
}
</script>
