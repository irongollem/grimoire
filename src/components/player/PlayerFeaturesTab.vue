<template>
  <div class="space-y-4">

    <!-- ── Class features ──────────────────────────────────────────────────── -->
    <div class="rounded-lg border border-border bg-card overflow-hidden">
      <div class="px-4 py-2.5 border-b border-border">
        <p class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider">Features</p>
      </div>

      <div v-if="Object.keys(featuresByLevel).length === 0" class="px-4 py-3">
        <p class="font-fell text-sm text-muted-foreground italic">No class features found.</p>
      </div>

      <div v-else class="divide-y divide-border">
        <div
          v-for="(features, lvl) in featuresByLevel"
          :key="lvl"
          class="flex gap-3 px-4 py-2.5"
        >
          <span class="font-cinzel text-[10px] text-muted-foreground tracking-wider w-12 shrink-0 pt-0.5">
            Lvl {{ lvl }}
          </span>
          <div class="flex flex-wrap gap-1.5">
            <span
              v-for="feat in features"
              :key="feat"
              class="inline-flex items-center rounded-md bg-muted/50 border border-border px-2 py-0.5 font-fell text-sm text-foreground"
            >{{ feat }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- ── Class choices ───────────────────────────────────────────────────── -->
    <div v-if="choiceEntries.length > 0" class="rounded-lg border border-border bg-card overflow-hidden">
      <div class="px-4 py-2.5 border-b border-border">
        <p class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider">Choices</p>
      </div>
      <div class="divide-y divide-border">
        <div
          v-for="entry in choiceEntries"
          :key="entry.key"
          class="flex gap-3 px-4 py-2.5"
        >
          <span class="font-cinzel text-[10px] text-muted-foreground tracking-wider w-32 shrink-0 pt-0.5">
            {{ entry.label }}
          </span>
          <div class="flex flex-wrap gap-1.5">
            <span
              v-for="val in entry.values"
              :key="val"
              class="inline-flex items-center rounded-md bg-primary/10 border border-primary/20 px-2 py-0.5 font-fell text-sm text-foreground"
            >{{ val }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- ── Resource pools ─────────────────────────────────────────────────── -->
    <div v-if="resourceEntries.length > 0" class="rounded-lg border border-border bg-card overflow-hidden">
      <div class="px-4 py-2.5 border-b border-border">
        <p class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider">Resources</p>
      </div>
      <div class="divide-y divide-border">
        <div
          v-for="res in resourceEntries"
          :key="res.key"
          class="flex items-center gap-3 px-4 py-2.5"
        >
          <span class="font-fell text-sm text-foreground flex-1">{{ res.label }}</span>
          <span class="font-cinzel text-xs text-muted-foreground">
            {{ res.current }} / {{ res.max }}
          </span>
          <span
            class="font-cinzel text-[10px] tracking-wider rounded px-1.5 py-0.5"
            :class="res.rest === 'short'
              ? 'bg-amber-500/10 text-amber-600 border border-amber-500/20'
              : 'bg-blue-500/10 text-blue-600 border border-blue-500/20'"
          >{{ res.rest === "short" ? "Short Rest" : "Long Rest" }}</span>
        </div>
      </div>
    </div>

  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { getCharacterFeatures } from "@/levelup/classFeatures";
import type { PartyMember } from "@/types/party.types";

const props = defineProps<{ member: PartyMember }>();

// ── Features ──────────────────────────────────────────────────────────────────
const featuresByLevel = computed(() =>
  getCharacterFeatures(props.member.class ?? "", props.member.level),
);

// ── Class choices ─────────────────────────────────────────────────────────────
const CHOICE_LABELS: Record<string, string> = {
  subclass:               "Subclass",
  fighting_style:         "Fighting Style",
  pact_boon:              "Pact Boon",
  expertise:              "Expertise",
  eldritch_invocations:   "Invocations",
  metamagic_options:      "Metamagic",
  infusions_known:        "Infusions",
  favored_enemy:          "Favored Enemy",
  natural_explorer:       "Natural Explorer",
  ranger_conclave:        "Ranger Conclave",
  divine_domain:          "Divine Domain",
  druid_circle:           "Druid Circle",
  arcane_tradition:       "Arcane Tradition",
  sorcerous_origin:       "Sorcerous Origin",
  bardic_college:         "Bardic College",
  monastic_tradition:     "Monastic Tradition",
  roguish_archetype:      "Roguish Archetype",
  martial_archetype:      "Martial Archetype",
  barbarian_path:         "Primal Path",
};

const choiceEntries = computed(() => {
  const choices = props.member.class_choices ?? {};
  return Object.entries(choices)
    .filter(([, v]) => v !== null && v !== undefined && v !== "")
    .map(([key, value]) => ({
      key,
      label: CHOICE_LABELS[key] ?? key.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()),
      values: Array.isArray(value) ? (value as string[]) : [String(value)],
    }));
});

// ── Resource pools ────────────────────────────────────────────────────────────
const resourceEntries = computed(() =>
  Object.entries(props.member.class_resources ?? {}).map(([key, res]) => ({
    key,
    label: key.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()),
    current: res.current,
    max: res.max,
    rest: res.rest,
  })),
);
</script>
