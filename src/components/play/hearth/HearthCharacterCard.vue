<template>
  <section class="torn hearth-card rounded-lg p-3.5" :aria-label="`${displayName}, at a glance`">
    <div class="flex gap-3">
      <div class="card-plate relative h-27 w-18 shrink-0 overflow-hidden rounded-md bg-muted/50">
        <FocalImage
          v-if="portrait.src"
          :src="portrait.src"
          :alt="portrait.alt"
          format="portrait"
          :focal-point="portrait.focalPoint"
        />
        <span
          v-else
          class="absolute inset-0 flex items-center justify-center text-display font-bold text-muted-foreground"
          aria-hidden="true"
        >{{ displayName.charAt(0) }}</span>
      </div>

      <div class="flex min-w-0 flex-1 flex-col gap-2">
        <div class="min-w-0">
          <h3 class="hearth-display text-heading leading-tight truncate">{{ displayName }}</h3>
          <p class="text-caption italic text-muted-foreground">
            <template v-if="member.wildshape_state">{{ member.name }}</template>
            <template v-else>Level {{ summary.level }} {{ summary.line }}</template>
          </p>
        </div>

        <div>
          <div class="flex items-baseline justify-between gap-2">
            <span class="text-eyebrow text-muted-foreground">Hit points</span>
            <span class="text-heading-sm font-bold tabular-nums" :class="hp.textClass">
              {{ hp.current }}
              <span class="text-caption font-normal text-muted-foreground">/ {{ hp.max }}</span>
            </span>
          </div>
          <div
            class="mt-1 h-1.5 overflow-hidden rounded-full bg-muted"
            role="meter"
            aria-label="Hit points"
            :aria-valuenow="hp.current"
            aria-valuemin="0"
            :aria-valuemax="hp.max"
          >
            <div class="h-full rounded-full" :class="hp.barClass" :style="{ width: `${hp.pct}%` }" />
          </div>
        </div>

        <dl class="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-caption text-muted-foreground">
          <div class="flex items-baseline gap-1"><dt class="text-eyebrow">AC</dt><dd class="font-bold text-foreground">{{ armorClass }}</dd></div>
          <div class="flex items-baseline gap-1"><dt class="text-eyebrow">Speed</dt><dd class="font-bold text-foreground">{{ speed }} ft</dd></div>
          <div class="flex items-baseline gap-1"><dt class="text-eyebrow">Init</dt><dd class="font-bold text-foreground">{{ signed(initiative) }}</dd></div>
          <div class="flex items-baseline gap-1"><dt class="text-eyebrow">Passive</dt><dd class="font-bold text-foreground">{{ passivePerception }}</dd></div>
        </dl>
      </div>
    </div>

    <div v-if="exhaustion > 0 || otherConditions.length || slotGroups.length" class="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-border/60 pt-2.5 text-caption">
      <span v-if="exhaustion > 0" class="inline-flex items-center gap-1.5 text-ink-caution">
        <i class="inline-block h-1.5 w-1.5 rotate-45 bg-current" aria-hidden="true" />Exhaustion {{ exhaustion }}
      </span>
      <span v-for="c in otherConditions" :key="c" class="inline-flex items-center gap-1.5 text-ink-caution">
        <i class="inline-block h-1.5 w-1.5 rotate-45 bg-current" aria-hidden="true" />{{ c }}
      </span>
      <span v-if="slotGroups.length" class="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
        <span class="text-eyebrow text-muted-foreground">Slots</span>
        <span v-for="g in slotGroups" :key="g.key" class="inline-flex items-center gap-1" :aria-label="g.label">
          <span class="text-muted-foreground" aria-hidden="true">{{ g.ordinal }}</span>
          <span class="inline-flex gap-0.5" aria-hidden="true">
            <i
              v-for="n in g.max"
              :key="n"
              class="inline-block h-1.5 w-1.5 rotate-45 border border-primary"
              :class="n <= g.max - g.used ? 'bg-primary' : ''"
            />
          </span>
        </span>
      </span>
    </div>

    <RouterLink
      to="/play/character"
      class="mt-1 -mb-2 inline-flex min-h-11 items-center gap-1 text-eyebrow text-primary hover:underline"
    >
      Character sheet <IconChevronRight class="h-3.5 w-3.5" aria-hidden="true" />
    </RouterLink>
  </section>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { RouterLink } from "vue-router";
import FocalImage from "@/components/common/FocalImage.vue";
import { IconChevronRight } from "@/lib/icons";
import { useMemberVitals } from "@/composables/party/useMemberVitals";
import { useCharacterClasses } from "@/composables/party/useCharacterClasses";
import { useAllSpecies } from "@/composables/rules/useSpecies";
import { characterSummary } from "@/lib/partyMemberDisplay";
import { formPortrait } from "@/lib/wildshapePortrait";
import { getExhaustionLevel } from "@/rules/conditions";
import type { PartyMember } from "@/types/party.types";

/**
 * The character at a glance: portrait, name, level and class, hit points, AC,
 * speed and initiative, conditions and a read-only slot summary. The full sheet
 * is one link away; nothing here edits. While Wild Shaped the card shows the
 * beast's face, AC and speed, as the sheet's own header does.
 */
const { member } = defineProps<{ member: PartyMember }>();

const memberId = computed(() => member.id);
const { data: classes } = useCharacterClasses(memberId);
const { data: species } = useAllSpecies();
const { wildshape, beastMonster, armorClass, initiative, speed, passivePerception, hp } = useMemberVitals(() => member);

const displayName = computed(() => wildshape.value?.beast_name ?? member.name);
const portrait = computed(() => formPortrait(member, wildshape.value, beastMonster.value?.image_url));

const summary = computed(() =>
  characterSummary({
    speciesName: species.value?.find((s) => s.id === member.species_id)?.name ?? null,
    subrace: member.subrace,
    classes: classes.value,
    fallbackLevel: member.level,
  }),
);

const exhaustion = computed(() => getExhaustionLevel(member.conditions));
const otherConditions = computed(() =>
  member.conditions.filter((c) => !/^Exhaust(?:ed|ion)\s+\d$/i.test(c)),
);

const ORDINALS = ["", "1st", "2nd", "3rd"];
const slotGroups = computed(() =>
  member.spell_slots
    .filter((s) => s.max > 0)
    .map((s, i) => {
      const ordinal = ORDINALS[s.level] || `${s.level}th`;
      return {
        key: `${s.level}-${s.pool ?? "spellcasting"}-${i}`,
        ordinal,
        max: s.max,
        used: Math.min(s.used, s.max),
        label: `${ordinal} level slots, ${s.max - Math.min(s.used, s.max)} of ${s.max} left`,
      };
    }),
);

function signed(n: number): string {
  return n >= 0 ? `+${n}` : String(n);
}
</script>

<style scoped>
.hearth-display {
  font-family: "Cinzel", Georgia, serif;
}
</style>
