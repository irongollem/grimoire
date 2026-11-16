<template>
  <section>
    <p class="section-heading">How it fights</p>
    <p class="caption">
      Used when the app runs this creature's turn for you. Leave a field on Automatic to let its stat block decide.
    </p>
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <label class="block">
        <span class="field-label">Role</span>
        <AppSelect v-model="role" tone="filled" size="body" weight="normal" block>
          <option value="">Automatic: {{ ROLE_LABELS[automatic.role] }}</option>
          <option v-for="(label, value) in ROLE_LABELS" :key="value" :value="value">{{ label }}</option>
        </AppSelect>
      </label>
      <label class="block">
        <span class="field-label">Goes for</span>
        <AppSelect v-model="targets" tone="filled" size="body" weight="normal" block>
          <option value="">Automatic: {{ TARGET_LABELS[automatic.targets] }}</option>
          <option v-for="(label, value) in TARGET_LABELS" :key="value" :value="value">{{ label }}</option>
        </AppSelect>
      </label>
      <label class="block">
        <span class="field-label">Cover</span>
        <AppSelect v-model="cover" tone="filled" size="body" weight="normal" block>
          <option value="">Automatic: {{ COVER_LABELS[automatic.cover] }}</option>
          <option v-for="(label, value) in COVER_LABELS" :key="value" :value="value">{{ label }}</option>
        </AppSelect>
      </label>
      <label class="block">
        <span class="field-label">When it is losing</span>
        <AppSelect v-model="morale" tone="filled" size="body" weight="normal" block>
          <option value="auto">Automatic: {{ moraleLabel(automatic.morale) }}</option>
          <option v-for="preset in MORALE_PRESETS" :key="preset.key" :value="preset.key">{{ moraleLabel(preset.morale) }}</option>
          <option v-if="authoredMorale !== null && moraleKey(authoredMorale) === CUSTOM_MORALE" :value="CUSTOM_MORALE">
            {{ moraleLabel(authoredMorale) }}
          </option>
        </AppSelect>
      </label>
      <label class="block sm:col-span-2">
        <span class="field-label">Its note</span>
        <AppInput
          v-model.trim="note"
          tone="filled"
          size="body"
          :maxlength="NOTE_MAX_LENGTH"
          placeholder="Guards the door and never leaves it"
        />
        <span class="caption mt-1">
          One line in your own words. When AI is on for the campaign, the app will not pick a turn that goes against it.
        </span>
      </label>
    </div>
    <p class="caption mt-3">{{ tierSentence }}</p>
  </section>
</template>

<script setup lang="ts">
import { computed } from "vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import AppSelect from "@/components/common/controls/AppSelect.vue";
import { tacticalProfile, type CleverTier, type MoraleRule } from "@/rules/fight/tactics/profile";
import type { MonsterStatBlock, MonsterTactics, MonsterType } from "@/types/monster.types";
import type { StatBlock } from "@/types/npc.types";

const { sb, creatureType } = defineProps<{
  sb: MonsterStatBlock | StatBlock;
  creatureType: MonsterType | null;
}>();

/** The server sends the note to the model as it stands and caps nothing (tacticsJudge.noteRequest), so this is only a sanity limit for one line. */
const NOTE_MAX_LENGTH = 200;

type Role = NonNullable<MonsterTactics["role"]>;
type Targets = NonNullable<MonsterTactics["targets"]>;
type Cover = NonNullable<MonsterTactics["cover"]>;

const ROLE_LABELS: Record<Role, string> = {
  brute: "Brute",
  skirmisher: "Skirmisher",
  artillery: "Artillery",
  controller: "Controller",
  leader: "Leader",
  lurker: "Lurker",
};
const TARGET_LABELS: Record<Targets, string> = {
  nearest: "Whoever is nearest",
  most_wounded: "The most wounded",
  spellcasters_first: "Spellcasters first",
  lowest_armor: "The lowest armor",
};
const COVER_LABELS: Record<Cover, string> = {
  ignores: "Ignores it",
  when_cheap: "Takes it when it is cheap",
  fights_from: "Fights from it",
};

// `then` is the stat block's own morale field (#1203), not a promise
const MORALE_PRESETS: { key: string; morale: MoraleRule }[] = [
  // oxlint-disable-next-line unicorn/no-thenable -- see above
  { key: "never", morale: { breaksAt: 0, then: "fight_on" } },
  // oxlint-disable-next-line unicorn/no-thenable -- see above
  { key: "flee-25", morale: { breaksAt: 0.25, then: "flee" } },
  // oxlint-disable-next-line unicorn/no-thenable -- see above
  { key: "flee-50", morale: { breaksAt: 0.5, then: "flee" } },
  // oxlint-disable-next-line unicorn/no-thenable -- see above
  { key: "surrender-25", morale: { breaksAt: 0.25, then: "surrender" } },
  // oxlint-disable-next-line unicorn/no-thenable -- see above
  { key: "surrender-50", morale: { breaksAt: 0.5, then: "surrender" } },
];
const CUSTOM_MORALE = "custom";

function moraleKey(m: MoraleRule): string {
  const preset = MORALE_PRESETS.find((p) => p.morale.breaksAt === m.breaksAt && p.morale.then === m.then);
  return preset === undefined ? CUSTOM_MORALE : preset.key;
}

function moraleLabel(m: MoraleRule): string {
  if (m.breaksAt <= 0) return "Fights to the death";
  const share = `${Math.round(m.breaksAt * 100)}% of its hit points`;
  const at = m.breaksAt === 0.25 ? "a quarter of its hit points" : m.breaksAt === 0.5 ? "half its hit points" : share;
  // A creature told to fight on keeps fighting however hurt it is (pick.ts, RULE gate), so this is worded as what it does.
  if (m.then === "fight_on") return `Fights on below ${at}`;
  return `${m.then === "flee" ? "Flees" : "Surrenders"} at ${at}`;
}

/** What the stat block alone gives: the authored tactics are left out on purpose, so "Automatic" never echoes a choice. */
const automatic = computed(() => tacticalProfile({ ...sb, tactics: undefined }, creatureType));

const authoredMorale = computed(() => sb.tactics?.morale ?? null);

/** Drops an emptied `tactics` altogether: the saved stat block never carries `{}`. */
function pruneTactics() {
  if (sb.tactics !== undefined && Object.keys(sb.tactics).length === 0) delete sb.tactics;
}

function fieldModel<K extends "role" | "targets" | "cover">(key: K) {
  return computed<NonNullable<MonsterTactics[K]> | "">({
    get: () => {
      const current = sb.tactics?.[key];
      return current === undefined ? "" : current;
    },
    set: (value) => {
      if (value === "") {
        if (sb.tactics !== undefined) delete sb.tactics[key];
        pruneTactics();
        return;
      }
      if (sb.tactics === undefined) sb.tactics = {};
      sb.tactics[key] = value;
    },
  });
}
const role = fieldModel("role");
const targets = fieldModel("targets");
const cover = fieldModel("cover");

const morale = computed<string>({
  get: () => (authoredMorale.value === null ? "auto" : moraleKey(authoredMorale.value)),
  set: (key) => {
    if (key === CUSTOM_MORALE) return;
    if (key === "auto") {
      if (sb.tactics !== undefined) delete sb.tactics.morale;
      pruneTactics();
      return;
    }
    const preset = MORALE_PRESETS.find((p) => p.key === key);
    if (preset === undefined) return;
    if (sb.tactics === undefined) sb.tactics = {};
    sb.tactics.morale = { ...preset.morale };
  },
});

const note = computed<string>({
  // The field shows nothing for a creature with no note; nothing is stored for it either (see the setter).
  get: () => {
    const current = sb.tactics?.note;
    return current === undefined ? "" : current;
  },
  set: (text) => {
    if (text.length === 0) {
      if (sb.tactics !== undefined) delete sb.tactics.note;
      pruneTactics();
      return;
    }
    if (sb.tactics === undefined) sb.tactics = {};
    sb.tactics.note = text;
  },
});

const TIER_WORDS: Record<CleverTier, string> = {
  instinct: "on instinct",
  simple: "as a simple creature",
  trained: "as a trained creature",
  tactical: "as a tactical creature",
};
const EXTRA_TURN_LABELS: Record<string, string> = { dodge: "Dodge", disengage: "Disengage", hide: "Hide" };

/** The tier in words, and the turns beyond attacking and moving that this creature is offered. */
const tierSentence = computed(() => {
  const profile = tacticalProfile(sb, creatureType);
  const extras = [...profile.offers].flatMap((kind) => (kind in EXTRA_TURN_LABELS ? [EXTRA_TURN_LABELS[kind]] : []));
  const lead = `With Intelligence ${sb.int} it fights ${TIER_WORDS[profile.tier]}`;
  if (extras.length === 0) return `${lead}: it attacks, moves, dashes and flees, nothing cleverer.`;
  const list = extras.length === 1 ? extras[0] : `${extras.slice(0, -1).join(", ")} and ${extras[extras.length - 1]}`;
  return `${lead}: it can also ${list}.`;
});
</script>

<style scoped>
@reference "@/assets/main.css";

.field-label {
  @apply block text-label-lg font-semibold text-muted-foreground mb-1;
}
.section-heading {
  @apply text-label-lg font-semibold text-muted-foreground uppercase mb-3;
}
.caption {
  @apply block text-caption text-muted-foreground mb-3;
}
</style>
