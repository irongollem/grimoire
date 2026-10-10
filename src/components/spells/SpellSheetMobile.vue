<template>
  <!--
    Mobile-only (<md) spell read screen, the phone twin of SpellSheet. Built on
    EntitySheetMobile like MonsterSheetMobile and NpcDetailMobile; SpellDetailView
    mounts it when useIsMobile() is true.

    Spell-specific parts:
      - level pill + school pill (tinted with the school's colour) over the hero
      - quick facts: Casting time / Range / Components / Duration
      - sections: Description, At Higher Levels, Classes, Source
      - the DM's note box when the page passes `showDmNote`
      - bottom bar: Edit, when `canEdit`. No reveal and no delete on the phone
        sheet (so no overflow menu either).
  -->
  <EntitySheetMobile
    back-to="/spells"
    :name="spell.name"
    :subtitle="subtitle"
    :image="spell.image_url"
    :focal-point="spell.image_focal_point"
    :placeholder="placeholderUrl('spell')"
    :tags="spell.tags"
  >
    <template #pills>
      <span class="rounded bg-black/55 px-2 py-0.5 text-eyebrow font-bold text-white">
        {{ spellLevelLabel(spell.level) }}
      </span>
      <span
        class="rounded px-2 py-0.5 text-eyebrow font-bold capitalize text-white"
        :class="SCHOOL_BG[spell.school]"
      >
        {{ spell.school }}
      </span>
    </template>

    <template #facts>
      <QuickFact label="Casting time" :value="spellCastingTime(spell)" class="bg-card" />
      <QuickFact label="Range" :value="spellRange(spell)" class="bg-card" />
      <QuickFact label="Components" :value="spellComponentsInWords(spell)" class="bg-card" />
      <QuickFact label="Duration" :value="durationLine" class="bg-card" />
    </template>

    <DmNoteBox v-if="showDmNote" type="spell" :id="spell.id" :label="spell.name" />

    <AccordionSection v-model:open="openSections.description" title="Description">
      <RichTextViewer :content="spell.description" class="lore" />
    </AccordionSection>

    <AccordionSection
      v-if="spell.higher_levels"
      v-model:open="openSections.higherLevels"
      title="At Higher Levels"
    >
      <RichTextViewer :content="spell.higher_levels" />
    </AccordionSection>

    <AccordionSection v-if="spell.classes?.length" v-model:open="openSections.classes" title="Classes">
      <p class="text-body text-foreground">{{ spell.classes.join(", ") }}</p>
    </AccordionSection>

    <AccordionSection v-if="spell.source" v-model:open="openSections.source" title="Source">
      <p class="text-body italic text-muted-foreground">
        <a
          v-if="spell.source_url"
          :href="spell.source_url"
          target="_blank"
          rel="noopener noreferrer"
          class="underline"
        >{{ sourceLabel }}</a>
        <template v-else>{{ sourceLabel }}</template>
      </p>
    </AccordionSection>

    <template v-if="canEdit" #bottom-bar>
      <AppButton
        variant="primary"
        size="md"
        class="flex-1"
        :to="`/spells/${spell.id}?edit=true`"
        :icon="IconEdit"
        icon-size="md"
        label="Edit"
      />
    </template>
  </EntitySheetMobile>
</template>

<script setup lang="ts">
import { computed, reactive } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import EntitySheetMobile from "@/components/common/entity/EntitySheetMobile.vue";
import QuickFact from "@/components/common/entity/QuickFact.vue";
import AccordionSection from "@/components/common/AccordionSection.vue";
import RichTextViewer from "@/components/common/richtext/RichTextViewer.vue";
import DmNoteBox from "@/components/notes/DmNoteBox.vue";
import { IconEdit } from "@/lib/icons";
import { placeholderUrl } from "@/lib/placeholderFocalPoints";
import {
  needsConcentrationNote,
  spellCastingTime,
  spellComponentsInWords,
  spellDuration,
  spellRange,
} from "@/lib/spells/spellFacts";
import { SCHOOL_BG, spellLevelLabel, spellSourceLabel, type Spell } from "@/types/spell.types";

const { spell } = defineProps<{
  spell: Spell;
  /** Shows Edit in the bottom bar. */
  canEdit: boolean;
  /** Shows the DM's note box (the DM's own and custom spells). */
  showDmNote: boolean;
}>();

const subtitle = computed(() => {
  const line = `${spellLevelLabel(spell.level)} · ${spell.school}`;
  return spell.ritual ? `${line} · Ritual` : line;
});

const durationLine = computed(() =>
  needsConcentrationNote(spell) ? `${spellDuration(spell)} (concentration)` : spellDuration(spell),
);

const sourceLabel = computed(() => spellSourceLabel(spell.source, spell.source_title));

// Everything the sheet shows is short and worth reading at once, so every
// section starts open (the monster and NPC sheets keep their long ones shut).
const openSections = reactive({
  description: true,
  higherLevels: true,
  classes: true,
  source: true,
});
</script>
