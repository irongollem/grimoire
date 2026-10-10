<template>
  <div class="actions">
    <p
      v-for="e in rechargeLines"
      :key="e.action"
      class="recharge-line"
      :class="e.recharged ? 'text-tone-success' : 'text-muted-foreground'"
      data-testid="recharge-line"
    >
      {{ actionUseName(e.action) }} {{ e.recharged ? "recharged" : "still spent" }} · rolled {{ e.roll }}
    </p>

    <template v-for="section in visibleSections" :key="section.label">
      <div class="detail-divider" />
      <p class="detail-section-label">{{ section.label }}</p>
      <article
        v-for="item in section.items"
        :key="item.key"
        class="action"
        :data-testid="`action-${item.entry.name}`"
      >
        <header class="action-head">
          <strong class="action-name">{{ item.entry.name }}</strong>
          <span v-for="b in item.badges" :key="b" class="action-badge" :class="{ 'is-spent': !item.usable }">{{ b }}</span>
        </header>
        <p v-if="item.summary" class="action-summary">{{ item.summary }}</p>
        <div v-if="item.html" class="action-prose" v-html="item.html"></div>

        <div v-if="item.controls.length > 0 || item.limited || !item.usable" class="action-controls">
          <AppButton
            v-for="c in item.controls"
            :key="c.label"
            variant="tinted"
            :tone="c.tone"
            size="md"
            :label="c.label"
            :disabled="!item.usable"
            :data-testid="`use-${item.entry.name}-${c.label}`"
            @click="start(item, c.option)"
          />
          <!-- A limited ability with nothing to roll (Invisibility, a 1/day
               teleport) still has to be marked used, or its recharge never rolls. -->
          <AppButton
            v-if="item.controls.length === 0 && item.limited && item.usable"
            variant="subtle"
            size="md"
            label="Use"
            tooltip="Mark this ability used"
            :data-testid="`use-${item.entry.name}`"
            @click="store.useAction(combatant.instance_id, item.useKey, actionLimit(item.entry))"
          />
          <AppButton
            v-if="!item.available"
            variant="ghost"
            size="sm"
            label="Restore"
            tooltip="Mark this ability available again"
            :data-testid="`restore-${item.entry.name}`"
            @click="store.restoreAction(combatant.instance_id, item.useKey)"
          />
        </div>

        <p v-if="item.steps.length > 0" class="action-steps" data-testid="multiattack-steps">
          <template v-for="(s, i) in item.steps" :key="i">
            <span v-if="i > 0" aria-hidden="true"> · </span>
            <AppButton
              v-if="s.target"
              variant="link"
              size="inline"
              :label="`${s.count}× ${s.action}`"
              :data-testid="`step-${s.action}`"
              @click="openStep(s.target)"
            />
            <span v-else>{{ s.count }}× {{ s.action }}</span>
          </template>
        </p>

        <Transition v-bind="drawerTransition()">
          <RunnerResolvePanel
            v-if="open && open.key === item.key"
            :key="open.resolved.name"
            :attacker="combatant"
            :entry="open.resolved"
            :dm-mode="ctx.rollMode.value"
            :silent="ctx.silent.value"
            @first-roll="spendOpen"
            @close="open = null"
          />
        </Transition>
      </article>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, inject, ref } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import RunnerResolvePanel from "@/components/encounters/RunnerResolvePanel.vue";
import { RUNNER_ROLL_CONTEXT } from "@/components/encounters/runnerResolve";
import { describeStructure } from "@/lib/statBlock/describeStructure";
import { drawerTransition } from "@/lib/motion";
import { renderTiptapHtml } from "@/lib/tiptap/renderTiptap";
import { actionAvailability, actionLimit, actionUseKey, actionUseName } from "@/rules/encounterTurn";
import { useEncounterRunStore } from "@/stores/encounterRun";
import type { RunCombatant } from "@/types/encounter.types";
import type { StatBlockListKey } from "@/rules/statBlock/parseAction";
import type { ActionOption, StatBlockEntry } from "@/types/statBlock.types";

/**
 * A creature's stat-block entries with the controls that roll them (#1017).
 * Replaces the prose-reading trait list: what an entry rolls comes from its
 * structure, never from regexes over its text.
 */
const { combatant, sections } = defineProps<{
  combatant: RunCombatant;
  sections: Array<{ label: string; list: StatBlockListKey; entries: StatBlockEntry[] | undefined }>;
}>();

const store = useEncounterRunStore();
const ctx = inject(RUNNER_ROLL_CONTEXT);
if (!ctx) throw new Error("RunnerActionList must be rendered inside RunnerEntityDetail");

interface Control {
  label: string;
  tone: "primary" | "arcane";
  /** Set for one choice of an "options" entry. */
  option?: ActionOption;
}

interface Item {
  key: string;
  entry: StatBlockEntry;
  list: StatBlockListKey;
  /** Where this entry's limited-use tally is kept (`actionUseKey`). */
  useKey: string;
  /** The tally has a use left. */
  available: boolean;
  /** Why the shared pool forbids it right now (legendary cost, lair fired), or null. */
  blocked: string | null;
  /** Can be rolled: has a use left and the pool allows it. */
  usable: boolean;
  badges: string[];
  summary: string | null;
  html: string;
  controls: Control[];
  /** Has a recharge or a per-day limit to track. */
  limited: boolean;
  steps: Array<{ action: string; count: number; target: Item | null }>;
}

interface OpenPanel {
  key: string;
  list: StatBlockListKey;
  /** The entry as written: where the limited-use tally is kept. */
  base: StatBlockEntry;
  /** What is rolled: the entry, or the chosen option shaped as one. */
  resolved: StatBlockEntry;
}

const open = ref<OpenPanel | null>(null);

const rechargeLines = computed(() => store.lastRechargeEvents.filter((e) => e.instanceId === combatant.instance_id));

function controlsFor(entry: StatBlockEntry): Control[] {
  const s = entry.structured;
  if (s.kind === "attack" && s.attack) return [{ label: "Attack", tone: "primary" }];
  if (s.kind === "save" && s.save) return [{ label: "Force save", tone: "arcane" }];
  if (s.kind === "options" && s.options) {
    return s.options.map((o) => ({
      label: o.name,
      tone: o.kind === "save" ? ("arcane" as const) : ("primary" as const),
      option: o,
    }));
  }
  return [];
}

/** Recharge and per-day badges give way to the live label ("Recharge 5–6 · spent", "1/3 left"). */
function badgesFor(entry: StatBlockEntry, badges: string[], label: string | null): string[] {
  const { recharge, uses } = entry.structured;
  const kept = badges.filter(
    (b) => !(recharge && b.startsWith("Recharge")) && !(uses && /^\d+\/(day|short rest|long rest)$/.test(b)),
  );
  return label ? [label, ...kept] : kept;
}

/** The pool a legendary or lair entry draws on, as RunnerBossMechanics gates it. */
function blockedReason(list: StatBlockListKey, entry: StatBlockEntry): string | null {
  if (list === "legendary_actions") {
    const left = combatant.legendary_actions_remaining;
    const cost = legendaryCost(entry);
    return typeof left === "number" && cost > left ? `Costs ${cost} \u00b7 ${left} left` : null;
  }
  if (list === "lair_actions") return store.lairCanFireThisRound ? null : "Lair action used this round";
  return null;
}

function legendaryCost(entry: StatBlockEntry): number {
  return entry.structured.legendary_cost ?? 1;
}

function buildItem(list: StatBlockListKey, index: number, entry: StatBlockEntry): Item {
  const described = describeStructure(entry.structured);
  const availability = actionAvailability(combatant, entry, list);
  const blocked = blockedReason(list, entry);
  const badges = badgesFor(entry, described.badges, availability.label);
  return {
    key: `${list}:${index}`,
    entry,
    list,
    useKey: actionUseKey(list, entry),
    available: availability.available,
    blocked,
    usable: availability.available && blocked === null,
    badges: blocked ? [blocked, ...badges] : badges,
    summary: described.summary,
    html: renderTiptapHtml(entry.description),
    controls: controlsFor(entry),
    limited: entry.structured.recharge !== undefined || entry.structured.uses !== undefined,
    steps: [],
  };
}

const visibleSections = computed(() => {
  const built = sections
    .filter((s) => s.entries && s.entries.length > 0)
    .map((s) => ({ label: s.label, items: (s.entries ?? []).map((e, i) => buildItem(s.list, i, e)) }));
  const all = built.flatMap((s) => s.items);
  // A multiattack step names another entry of the same stat block; link the ones that roll.
  for (const item of all) {
    const steps = item.entry.structured.kind === "multiattack" ? item.entry.structured.multiattack : undefined;
    item.steps = (steps ?? []).map((s) => {
      const target = all.find((o) => o !== item && o.entry.name.trim().toLowerCase() === s.action.trim().toLowerCase());
      return { action: s.action, count: s.count, target: target && target.controls.length > 0 ? target : null };
    });
  }
  return built;
});

/** An options entry rolls as the chosen option, named "Breath: Fire". */
function resolve(entry: StatBlockEntry, option: ActionOption | undefined): StatBlockEntry {
  if (!option) return entry;
  return {
    ...entry,
    name: `${entry.name}: ${option.name}`,
    structured: { ...entry.structured, kind: option.kind, attack: option.attack, save: option.save },
  };
}

function start(item: Item, option: ActionOption | undefined) {
  if (!item.usable) return;
  open.value = { key: item.key, list: item.list, base: item.entry, resolved: resolve(item.entry, option) };
}

/** A multiattack step opens its entry's panel; an entry with choices asks for the choice first. */
function openStep(target: Item) {
  const only = target.controls.length === 1 ? target.controls[0] : undefined;
  if (only) start(target, only.option);
}

function spendOpen() {
  if (!open.value) return;
  const { base, list } = open.value;
  // The first roll commits the entry: it draws on the shared pool it belongs to.
  if (list === "legendary_actions") store.spendLegendaryActions(combatant.instance_id, legendaryCost(base));
  if (list === "lair_actions") store.markLairFired();
  const { recharge, uses } = base.structured;
  if (!recharge && !uses) return;
  store.useAction(combatant.instance_id, actionUseKey(list, base), actionLimit(base));
}
</script>

<style scoped>
@reference "@/assets/main.css";

.actions {
  @apply flex flex-col gap-2;
}

.detail-divider {
  @apply border-t border-border/60 my-1;
}

.detail-section-label {
  @apply text-eyebrow font-bold text-muted-foreground mt-1;
}

.recharge-line {
  @apply text-caption font-semibold;
}

.action {
  @apply flex flex-col gap-1 text-caption text-foreground leading-relaxed;
}

.action-head {
  @apply flex flex-wrap items-center gap-x-2 gap-y-0.5;
}

.action-name {
  @apply text-label-lg;
}

.action-badge {
  @apply rounded border border-border bg-muted/40 px-1.5 text-label text-muted-foreground;
}

.action-badge.is-spent {
  @apply border-tone-caution/40 text-tone-caution;
}

.action-summary {
  @apply text-foreground/80;
}

.action-prose {
  @apply text-muted-foreground;
}

.action-controls {
  @apply flex flex-wrap items-center gap-1.5;
}

.action-steps {
  @apply flex flex-wrap items-center gap-x-1 text-muted-foreground;
}
</style>
