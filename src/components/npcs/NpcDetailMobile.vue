<template>
  <!--
    Mobile-only (<md) NPC detail (read) screen. Rendered by NpcDetailView
    when useIsMobile() is true; the desktop NpcSheet
    is shown otherwise, byte-identical to before.

    The scroll layout (app bar, hero, quick facts, tags, sections, bottom bar,
    overflow sheet) is EntitySheetMobile's; this file supplies the NPC parts.

    The reveal is `RevealControl`, which opens as a bottom sheet on its own
    below `md` — this screen no longer owns one.
  -->
  <EntitySheetMobile
    back-to="/npcs"
    :name="displayName"
    :subtitle="subtitle"
    :image="displayPortrait"
    :focal-point="displayFocalPoint"
    :placeholder="placeholderUrl('npc')"
    :tags="npc.tags"
  >
    <template #bar-actions="{ scrolled }">
      <!--
        The app bar's reveal. Below `md` the control opens as a bottom sheet on
        its own. The form follows the bar; see EntitySheetMobile for why.
      -->
      <NpcRevealControl :npc="npc" :form="scrolled ? 'inline' : 'overlay'" />
    </template>

    <template #pills>
      <span class="relative rounded px-2 py-0.5 text-eyebrow font-bold text-white">
        <span class="absolute inset-0 rounded opacity-90" :class="relClass" />
        <span class="relative">{{ NPC_RELATIONSHIP_LABELS[npc.relationship] }}</span>
      </span>
      <span class="relative rounded px-2 py-0.5 text-eyebrow font-bold text-white">
        <span class="absolute inset-0 rounded opacity-90" :class="statusClass" />
        <span class="relative">{{ npc.status }}</span>
      </span>
      <span
        v-if="shared"
        class="flex items-center gap-1 rounded bg-black/55 px-1.5 py-0.5 text-eyebrow font-bold text-primary"
      >
        <IconReveal class="size-3" /> Shared
      </span>
    </template>

    <template #identity>
      <p v-if="disguisedLine" class="text-caption italic text-primary/90 drop-shadow-sm">
        {{ disguisedLine }}
      </p>
    </template>

    <template v-if="hasAnyQuickFact" #facts>
      <QuickFact label="Location" :value="locationName" class="bg-card" />
      <QuickFact label="Alignment" :value="npc.alignment" class="bg-card" />
      <QuickFact label="Age" :value="npc.age" class="bg-card" />
      <QuickFact label="Faction" :value="factionLine" class="bg-card" />
    </template>

    <DmNoteBox type="npc" :id="npc.id" :label="npc.name" />

    <AccordionSection v-model:open="openSections.lore" title="Lore">
      <div class="flex flex-col gap-4">
        <NpcLoreSections :full="full" />

        <EntityBacklinks :entity-id="npc.id" heading-class="text-label-lg font-bold text-muted-foreground uppercase" />
      </div>
    </AccordionSection>

    <AccordionSection v-model:open="openSections.party" title="With the party">
      <NpcPartyTab :npc="npc" />
    </AccordionSection>

    <AccordionSection v-model:open="openSections.inventory" title="Inventory">
      <NpcInventorySection :npc-id="npc.id" :npc-name="displayName" />
    </AccordionSection>

    <AccordionSection v-model:open="openSections.relations" title="Relations">
      <NpcRelationsTab :npc-id="npc.id" />
    </AccordionSection>

    <AccordionSection v-model:open="openSections.combat" title="Combat">
      <div v-if="npc.stat_block" class="flex flex-col gap-4">
        <StatBlockPanel :sb="npc.stat_block" :name="npc.name" />
        <TraitList title="Special Abilities" :traits="npc.stat_block.special_abilities" />
        <SpellcastingList :spellcasting="npc.stat_block.spellcasting" />
        <TraitList title="Actions" :traits="npc.stat_block.actions" />
        <TraitList title="Bonus Actions" :traits="npc.stat_block.bonus_actions" />
        <TraitList title="Reactions" :traits="npc.stat_block.reactions" />
        <TraitList title="Legendary Actions" :traits="npc.stat_block.legendary_actions" />
        <TraitList title="Lair Actions" :traits="npc.stat_block.lair_actions" />
      </div>
      <p v-else class="text-body italic text-muted-foreground">No stat block defined for this NPC.</p>
    </AccordionSection>

    <AccordionSection v-model:open="openSections.voice" title="Voice Coach">
      <NpcVoiceCoach v-if="full" :npc="full" />
      <div v-else class="flex min-h-40 items-center justify-center"><BannerLoader class="h-8" /></div>
    </AccordionSection>

    <template #bottom-bar>
      <!-- `button` form: there is room here to name the audience outright. -->
      <NpcRevealControl :npc="npc" />

      <AppButton
        :to="`/npcs/${npc.id}?edit=true`"
        variant="primary"
        size="md"
        press="dim"
        class="flex-1"
        :icon="IconEdit"
        icon-size="md"
        label="Edit"
      />
    </template>

    <!-- Overflow ⋮ sheet: Generate / Scriptorium / Edit tags live in the edit
         form (they require the form to be mounted), so these route into it. -->
    <template #menu="{ close }">
      <AppButton
        v-if="isAiEnabled"
        :to="`/npcs/${npc.id}?edit=true`"
        variant="menu"
        size="body"
        block
        press="muted"
        class="hover:bg-transparent"
        :icon="IconGenerate"
        icon-size="md"
        label="Generate with AI"
        @click="close"
      />
      <AppButton
        :to="`/npcs/${npc.id}?edit=true`"
        variant="menu"
        size="body"
        block
        press="muted"
        class="hover:bg-transparent"
        :icon="IconScrollText"
        icon-size="md"
        label="Send to Scriptorium"
        @click="close"
      />
      <AppButton
        :to="`/npcs/${npc.id}?edit=true`"
        variant="menu"
        size="body"
        block
        press="muted"
        class="hover:bg-transparent"
        :icon="IconTag"
        icon-size="md"
        label="Edit tags"
        @click="close"
      />
      <AppButton
        variant="menu"
        tone="danger"
        size="body"
        block
        icon-size="md"
        class="hover:bg-transparent active:bg-destructive/10"
        :icon="IconDelete"
        label="Delete NPC"
        @click="onDelete"
      />
    </template>
  </EntitySheetMobile>
</template>

<script setup lang="ts">
import { computed, reactive } from "vue";
import { useRouter } from "vue-router";
import EntitySheetMobile from "@/components/common/entity/EntitySheetMobile.vue";
import BannerLoader from "@/components/brand/BannerLoader.vue";
import NpcLoreSections from "@/components/npcs/NpcLoreSections.vue";
import StatBlockPanel from "@/components/common/statblock/StatBlockPanel.vue";
import TraitList from "@/components/common/statblock/TraitList.vue";
import SpellcastingList from "@/components/common/statblock/SpellcastingList.vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import NpcInventorySection from "@/components/npcs/NpcInventorySection.vue";
import NpcPartyTab from "@/components/npcs/NpcPartyTab.vue";
import NpcRelationsTab from "@/components/npcs/NpcRelationsTab.vue";
import QuickFact from "@/components/common/entity/QuickFact.vue";
import AccordionSection from "@/components/common/AccordionSection.vue";
import NpcRevealControl from "@/components/npcs/NpcRevealControl.vue";
import NpcVoiceCoach from "@/components/npcs/NpcVoiceCoach.vue";
import DmNoteBox from "@/components/notes/DmNoteBox.vue";
import EntityBacklinks from "@/components/common/entity/EntityBacklinks.vue";
import { IconDelete, IconEdit, IconGenerate, IconReveal, IconScrollText, IconTag } from "@/lib/icons";
import { useDeleteNpc } from "@/composables/npcs/useNpcs";
import { useNpcFactions } from "@/composables/factions/useFactions";
import { useAllLocations } from "@/composables/locations/useLocations";
import {
  getNpcDisplayName,
  getNpcDisplayPortrait,
  getNpcDisplayFocalPoint,
  isNpcConcealed,
  npcRelationshipBg,
  npcStatusBg,
} from "@/lib/npcDisplay";
import { placeholderUrl } from "@/lib/placeholderFocalPoints";
import { useCampaignStore } from "@/stores/campaign";
import { NPC_RELATIONSHIP_LABELS, type Npc, type NpcListRow } from "@/types/npc.types";

const { npc } = defineProps<{
  /** Paints at once from the list row; the prose waits for `full` (#999). */
  npc: NpcListRow;
  full?: Npc;
}>();

const router = useRouter();
const campaignStore = useCampaignStore();
const isAiEnabled = computed(() => campaignStore.isAiEnabled);

// ── Display helpers (mirror the desktop sheet) ──────────────────────────────────
const displayName = computed(() => getNpcDisplayName(npc) ?? "???");
const displayPortrait = computed(() => getNpcDisplayPortrait(npc));
const displayFocalPoint = computed(() => getNpcDisplayFocalPoint(npc));

const subtitle = computed(() => [npc.race, npc.occupation].filter(Boolean).join(" · "));

const disguisedLine = computed(() => {
  if (!isNpcConcealed(npc)) return "";
  return npc.disguise_name ? `Disguised as ${npc.disguise_name}` : "Disguised";
});

const relClass = computed(() => npcRelationshipBg(npc.relationship));
const statusClass = computed(() => npcStatusBg(npc.status));

const shared = computed(() => npc.player_visible_to.length > 0);

// ── Quick facts ────────────────────────────────────────────────────────────────
const { data: allLocations } = useAllLocations();
const locationName = computed(() => {
  if (!npc.location_id) return null;
  return allLocations.value?.find((l) => l.id === npc.location_id)?.name ?? null;
});

const { data: npcFactions } = useNpcFactions(npc.id);
const factionLine = computed(() => {
  const rows = npcFactions.value;
  if (!rows?.length) return null;
  return rows.map((r) => r.faction.name).join(", ");
});

const hasAnyQuickFact = computed(
  () => !!(locationName.value || npc.alignment || npc.age || factionLine.value),
);

// ── Accordion state (Lore open by default) ──────────────────────────────────────
const openSections = reactive({
  lore: true,
  party: false,
  inventory: false,
  relations: false,
  combat: false,
  voice: false,
});

// ── Delete ───────────────────────────────────────────────────────────────────
const { mutateAsync: deleteNpc } = useDeleteNpc();
async function onDelete() {
  if (!confirm(`Delete "${displayName.value}"? This cannot be undone.`)) return;
  await deleteNpc(npc);
  // Post-mutation navigation: list view is the success feedback.
  void router.push("/npcs");
}
</script>
