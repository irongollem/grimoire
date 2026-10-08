<template>
  <!--
    Mobile-only (<md) monster detail (read) screen. Rendered by
    MonsterDetailView when useIsMobile() is true; the
    desktop MonsterSheet is shown otherwise, byte-identical to before.

    Built on EntitySheetMobile, with the monster-specific parts:
      - CR pill (tinted by crBg) + SRD/source pill over the hero (no status
        dot — monsters have no alive/dead state)
      - quick-facts: Type / Size / Alignment / Habitat
      - accordion: Lore (description) + Combat (full stat block);
        no Inventory / Relations sections
      - primary bottom action is Customize for SRD monsters (clones to an
        editable copy), else Edit

    Scroll layout (see EntitySheetMobile):
      1. transparent glass app bar over the hero (solidifies on scroll)
      2. full-bleed hero portrait + CR/SRD badges + name + subtitle
      3. 2×2 quick-facts grid
      4. wrapping tags row
      5. accordion sections (Lore open by default)
      6. fixed bottom action bar (Reveal + Edit/Customize)
      7. Reveal bottom sheet + overflow ⋮ sheet
  -->
  <EntitySheetMobile
    back-to="/monsters"
    :name="monster.name"
    :subtitle="subtitle"
    subtitle-class="capitalize"
    :image="monster.image_url"
    :focal-point="monster.portrait_focal_point"
    :placeholder="placeholderUrl('monster')"
    :tags="monster.tags"
  >
    <template #bar-actions="{ scrolled }">
      <!--
        The app bar's reveal. Below `md` the control opens as a bottom sheet on
        its own. The form follows the bar; see EntitySheetMobile for why the
        scrim has to go when the bar solidifies.
      -->
      <MonsterRevealControl :monster="monster" :form="scrolled ? 'inline' : 'overlay'" />
    </template>

    <template #pills>
      <span
        class="rounded px-2 py-0.5 text-eyebrow font-bold text-white"
        :class="crBg(monster.stat_block.challenge_rating)"
      >
        CR {{ crText(monster.stat_block.challenge_rating) }}
      </span>
      <span
        v-if="monster.is_shared"
        class="rounded bg-black/55 px-2 py-0.5 text-eyebrow font-bold text-white"
      >
        {{ monster.source_title ?? monster.source ?? "Reference" }}
      </span>
      <span
        v-if="isDiscovered"
        class="flex items-center gap-1 rounded bg-black/55 px-1.5 py-0.5 text-eyebrow font-bold text-primary"
      >
        <IconReveal class="size-3" /> Shared
      </span>
    </template>

    <template #facts>
      <QuickFact label="Type" :value="monster.monster_type" class="bg-card capitalize" />
      <QuickFact label="Size" :value="monster.size" class="bg-card capitalize" />
      <QuickFact label="Alignment" :value="monster.alignment" class="bg-card capitalize" />
      <QuickFact label="Habitat" :value="monster.habitat" class="bg-card" />
    </template>

    <template #after-facts>
      <!-- Lair location link -->
      <RouterLink
        v-if="lairLocation"
        :to="placeRoute(lairLocation.id)"
        class="flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-3 text-label-lg text-muted-foreground"
      >
        <IconLocation class="size-4 shrink-0 text-primary/70" />
        Lair: {{ lairLocation.name }}
      </RouterLink>
    </template>

    <DmNoteBox v-if="!monster.is_shared" type="monster" :id="monster.id" :label="monster.name" />

    <AccordionSection v-model:open="openSections.lore" title="Lore">
      <div class="flex flex-col gap-4">
        <div v-if="description" class="flex flex-col gap-1">
          <h3 class="text-label-lg font-bold uppercase text-primary">Description</h3>
          <RichTextViewer :content="description" />
        </div>
        <p v-if="!description" class="text-body italic text-muted-foreground">
          No lore recorded for this monster.
        </p>
      </div>
    </AccordionSection>

    <AccordionSection v-model:open="openSections.combat" title="Combat">
      <div class="flex flex-col gap-4">
        <StatBlockPanel :sb="monster.stat_block" :name="monster.name" />
        <TraitList title="Special Abilities" :traits="monster.stat_block.special_abilities" />
        <SpellcastingList :spellcasting="monster.stat_block.spellcasting" />
        <TraitList title="Actions" :traits="monster.stat_block.actions" />
        <TraitList title="Bonus Actions" :traits="monster.stat_block.bonus_actions" />
        <TraitList title="Reactions" :traits="monster.stat_block.reactions" />
        <TraitList title="Legendary Actions" :traits="monster.stat_block.legendary_actions" />
        <TraitList title="Lair Actions" :traits="monster.stat_block.lair_actions" />
      </div>
    </AccordionSection>

    <template #bottom-bar>
      <!-- `button` form: there is room here to name the audience outright. -->
      <MonsterRevealControl :monster="monster" />

      <!-- SRD monsters clone to an editable copy (Customize); custom monsters edit -->
      <AppButton
        v-if="monster.is_shared"
        variant="primary"
        size="md"
        class="flex-1"
        :disabled="cloning"
        :icon="IconCopy"
        icon-size="md"
        :label="cloning ? 'Copying…' : 'Customize'"
        @click="customize"
      />
      <AppButton
        v-else
        variant="primary"
        size="md"
        class="flex-1"
        :to="`/monsters/${monster.id}?edit=true`"
        :icon="IconEdit"
        icon-size="md"
        label="Edit"
      />
    </template>

    <!-- Overflow ⋮ sheet: Send to Scriptorium / Delete live in the edit form
         (they require the form to be mounted), so these route into it. Duplicate
         is offered for custom monsters only (SRD uses Customize above). -->
    <template #menu="{ close }">
      <AppButton
        v-if="!monster.is_shared"
        variant="menu"
        size="md"
        block
        class="gap-3"
        :to="`/monsters/${monster.id}?edit=true`"
        :icon="IconCopy"
        icon-size="md"
        label="Duplicate"
        @click="close"
      />
      <AppButton
        variant="menu"
        size="md"
        block
        class="gap-3"
        :to="`/monsters/${monster.id}?edit=true`"
        :icon="IconScrollText"
        icon-size="md"
        label="Send to Scriptorium"
        @click="close"
      />
      <AppButton
        v-if="!monster.is_shared"
        variant="menu"
        tone="danger"
        press="tone"
        size="md"
        block
        class="gap-3"
        :icon="IconDelete"
        icon-size="md"
        label="Delete monster"
        @click="onDelete"
      />
    </template>
  </EntitySheetMobile>
</template>

<script setup lang="ts">
import { computed, reactive, ref, toRef } from "vue";
import AppButton from "@/components/common/AppButton.vue";
import { useRouter } from "vue-router";
import EntitySheetMobile from "@/components/common/EntitySheetMobile.vue";
import DmNoteBox from "@/components/notes/DmNoteBox.vue";
import RichTextViewer from "@/components/common/RichTextViewer.vue";
import StatBlockPanel from "@/components/common/StatBlockPanel.vue";
import TraitList from "@/components/common/TraitList.vue";
import SpellcastingList from "@/components/common/SpellcastingList.vue";
import QuickFact from "@/components/common/QuickFact.vue";
import AccordionSection from "@/components/common/AccordionSection.vue";
import MonsterRevealControl from "@/components/monsters/MonsterRevealControl.vue";
import { IconCopy, IconDelete, IconEdit, IconLocation, IconReveal, IconScrollText } from "@/lib/icons";
import { useCloneLibraryMonster, useDeleteMonster } from "@/composables/monsters/useMonsters";
import { useMonsterDescription } from "@/composables/monsters/useMonsterDescription";
import { useLocationTree } from "@/composables/locations/useLocations";
import { placeRoute } from "@/lib/locations/placeRoute";
import { useMonsterVisibility } from "@/composables/monsters/useMonsterVisibility";
import { crBg, crText } from "@/lib/monsterDisplay";
import type { Monster } from "@/types/monster.types";
import { placeholderUrl } from "@/lib/placeholderFocalPoints";

const { monster } = defineProps<{ monster: Monster }>();

const description = useMonsterDescription(() => monster);

const router = useRouter();

// ── Display helpers (mirror the desktop sheet) ──────────────────────────────────
const subtitle = computed(() => `${monster.size} ${monster.monster_type}, ${monster.alignment}`);

// Lair link resolves against the active campaign's location tree; a lair set
// in another campaign simply doesn't render here.
const { locationOptions } = useLocationTree();
const lairLocation = computed(() =>
  monster.lair_location_id
    ? (locationOptions.value.find((l) => l.id === monster.lair_location_id) ?? null)
    : null,
);

// ── Visibility / discovery (discovery model, not NPC field-list) ────────────────
// Only the hero badge still asks; the reveal itself is MonsterRevealControl's.
const { isDiscovered } = useMonsterVisibility(toRef(() => monster));

// ── Accordion state (Lore open by default) ──────────────────────────────────────
const openSections = reactive({
  lore: true,
  combat: false,
});

// ── Customize (SRD → editable clone) — mirrors MonsterDetail/MonsterSheet ───────
const { mutateAsync: clone } = useCloneLibraryMonster();
const cloning = ref(false);
async function customize() {
  if (!monster.is_shared) return;
  cloning.value = true;
  try {
    const copy = await clone(monster);
    void router.replace(`/monsters/${copy.id}`);
  } finally {
    cloning.value = false;
  }
}

// ── Delete ───────────────────────────────────────────────────────────────────
const { mutateAsync: deleteMonster } = useDeleteMonster();
async function onDelete() {
  if (!confirm(`Delete "${monster.name}"? This cannot be undone.`)) return;
  await deleteMonster(monster);
  // Post-mutation navigation: list view is the success feedback.
  void router.push("/monsters");
}
</script>
