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
import { COVER_LABELS, ROLE_LABELS, TARGET_LABELS, moraleLabel } from "@/components/common/statblock/tacticsWords";
import { tacticalProfile, type CleverTier, type MoraleRule } from "@/rules/fight/tactics/profile";
import type { MonsterStatBlock, MonsterTactics, MonsterType } from "@/types/monster.types";
import type { StatBlock } from "@/types/npc.types";

/**
 * `sb` is only read, for what "Automatic" means; the authored fields are the `tactics` model, so a form whose draft
 * is not a whole stat block (the companion's) can use this too. The model is undefined when nothing is authored:
 * a saved stat block never carries `{}`.
 */
const { sb, creatureType } = defineProps<{
  sb: MonsterStatBlock | StatBlock;
  creatureType: MonsterType | null;
}>();
const tactics = defineModel<MonsterTactics | undefined>("tactics", { required: true });

/** The server sends the note to the model as it stands and caps nothing (tacticsJudge.noteRequest), so this is only a sanity limit for one line. */
const NOTE_MAX_LENGTH = 200;

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

/** What the stat block alone gives: the authored tactics are left out on purpose, so "Automatic" never echoes a choice. */
const automatic = computed(() => tacticalProfile({ ...sb, tactics: undefined }, creatureType));

const authoredMorale = computed(() => tactics.value?.morale ?? null);

/** One authored field set, or taken away when `value` is undefined. An emptied `tactics` goes altogether. */
function write<K extends keyof MonsterTactics>(key: K, value: MonsterTactics[K] | undefined) {
  const next: MonsterTactics = { ...tactics.value };
  if (value === undefined) delete next[key];
  else next[key] = value;
  tactics.value = Object.keys(next).length === 0 ? undefined : next;
}

function fieldModel<K extends "role" | "targets" | "cover">(key: K) {
  return computed<NonNullable<MonsterTactics[K]> | "">({
    get: () => {
      const current = tactics.value?.[key];
      return current === undefined ? "" : current;
    },
    set: (value) => write(key, value === "" ? undefined : value),
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
      write("morale", undefined);
      return;
    }
    const preset = MORALE_PRESETS.find((p) => p.key === key);
    if (preset === undefined) return;
    write("morale", { ...preset.morale });
  },
});

const note = computed<string>({
  // The field shows nothing for a creature with no note; nothing is stored for it either (see the setter).
  get: () => {
    const current = tactics.value?.note;
    return current === undefined ? "" : current;
  },
  set: (text) => write("note", text.length === 0 ? undefined : text),
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
  const profile = tacticalProfile({ ...sb, tactics: tactics.value }, creatureType);
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
