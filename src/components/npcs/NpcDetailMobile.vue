<template>
  <!--
    Mobile-only (<md) NPC detail (read) screen. Rendered by NpcDetailView
    when useMediaQuery("(max-width: 767px)") is true; the desktop NpcSheet
    is shown otherwise, byte-identical to before.

    Scroll layout top → bottom:
      1. transparent glass app bar over the hero (solidifies on scroll)
      2. full-bleed hero portrait + badges + name + subtitle
      3. 2×2 quick-facts grid
      4. wrapping tags row
      5. accordion sections (Lore open by default)
      6. fixed bottom action bar (Reveal + Edit)
      7. overflow ⋮ sheet

    The reveal is `RevealControl`, which opens as a bottom sheet on its own
    below `md` — this screen no longer owns one.
  -->
  <div ref="scrollRoot" class="relative h-full overflow-y-auto md:hidden">
    <!-- ── 1. App bar (glass, over hero) ──────────────────────────────────── -->
    <header
      class="fixed inset-x-0 top-0 z-30 flex items-center justify-between gap-2 px-3 pt-[calc(env(safe-area-inset-top)+0.5rem)] pb-2 transition-colors duration-200"
      :class="scrolled ? 'border-b border-border bg-background/85 backdrop-blur-md' : ''"
    >
      <AppButton
        variant="ghost"
        size="icon-xs"
        shape="pill"
        press="muted"
        :class="[ICON_TOUCH_TARGET, 'shrink-0 backdrop-blur-sm', scrolled ? 'text-foreground' : 'bg-black/40 text-white hover:text-white active:bg-black/60']"
        aria-label="Back"
        @click="goBack"
      >
        <template #icon>
          <svg
            class="size-5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </template>
      </AppButton>

      <!-- Name fades in once scrolled past the hero -->
      <h1
        class="min-w-0 flex-1 truncate text-center text-heading-sm font-bold text-foreground transition-opacity duration-200"
        :class="scrolled ? 'opacity-100' : 'opacity-0'"
      >
        {{ displayName }}
      </h1>

      <div class="flex shrink-0 items-center gap-2">
        <!--
          The app bar's reveal. Below `md` the control opens as a bottom sheet
          on its own, which is what the hand-written `NpcRevealSheet` used to do
          — minus that sheet's separate idea of which fields exist.

          The form follows the bar, because what is behind the control changes
          as you scroll: over the hero it needs `overlay`'s scrim to stay
          legible on the portrait, and once the bar solidifies into light glass
          that same scrim is a black pill on a pale bar — the neighbours drop
          theirs at exactly this point for exactly this reason.
        -->
        <NpcRevealControl :npc="npc" :form="scrolled ? 'inline' : 'overlay'" />
        <AppButton
          variant="ghost"
          size="icon-xs"
          shape="pill"
          press="muted"
          :class="[ICON_TOUCH_TARGET, 'backdrop-blur-sm', scrolled ? 'text-foreground' : 'bg-black/40 text-white hover:text-white active:bg-black/60']"
          aria-label="More actions"
          @click="showMenu = true"
        >
          <template #icon>
            <!-- vertical ellipsis -->
            <svg class="size-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <circle cx="12" cy="5" r="1.6" />
              <circle cx="12" cy="12" r="1.6" />
              <circle cx="12" cy="19" r="1.6" />
            </svg>
          </template>
        </AppButton>
      </div>
    </header>

    <!-- ── 2. Hero ────────────────────────────────────────────────────────── -->
    <div class="relative h-80 w-full overflow-hidden bg-muted">
      <FocalImage
        :src="displayPortrait"
        :alt="displayName"
        format="portrait"
        :focal-point="displayFocalPoint"
        :render-width="600"
        placeholder="/assets/placeholders/npc.webp"
        class="absolute inset-0"
      />
      <!-- Gradient fading into the page background -->
      <div class="hero-fade pointer-events-none absolute inset-x-0 bottom-0 h-2/3" />

      <!-- Overlaid identity -->
      <div class="absolute inset-x-0 bottom-0 flex flex-col gap-1.5 px-4 pb-3">
        <div class="flex flex-wrap items-center gap-1.5">
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
        </div>

        <h2 class="text-display font-bold leading-tight text-white drop-shadow-sm">
          {{ displayName }}
        </h2>

        <p v-if="subtitle" class="text-body italic text-white/85 drop-shadow-sm">
          {{ subtitle }}
        </p>

        <p v-if="disguisedLine" class="text-caption italic text-primary/90 drop-shadow-sm">
          {{ disguisedLine }}
        </p>
      </div>
    </div>

    <!-- ── Body ───────────────────────────────────────────────────────────── -->
    <div class="flex flex-col gap-4 bg-background px-4 pt-4 pb-32">
      <!-- 3. Quick-facts grid (2×2, hairline-separated) -->
      <div
        v-if="hasAnyQuickFact"
        class="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border"
      >
        <NpcQuickFact label="Location" :value="locationName" class="bg-card" />
        <NpcQuickFact label="Alignment" :value="npc.alignment" class="bg-card" />
        <NpcQuickFact label="Age" :value="npc.age" class="bg-card" />
        <NpcQuickFact label="Faction" :value="factionLine" class="bg-card" />
      </div>

      <!-- 4. Tags -->
      <div v-if="npc.tags?.length" class="flex flex-wrap gap-1.5">
        <span
          v-for="tag in npc.tags"
          :key="tag"
          class="rounded-full bg-muted px-2.5 py-1 text-label text-muted-foreground"
        >
          {{ tag }}
        </span>
      </div>

      <!-- 5. Accordion sections -->
      <NpcAccordionSection v-model:open="openSections.lore" title="Lore">
        <div class="flex flex-col gap-4">
          <div v-if="npc.appearance" class="flex flex-col gap-1">
            <h3 class="text-label-lg font-bold uppercase text-primary">Appearance</h3>
            <RichTextViewer :content="npc.appearance" />
          </div>
          <div v-if="npc.personality" class="flex flex-col gap-1">
            <h3 class="text-label-lg font-bold uppercase text-primary">Personality</h3>
            <RichTextViewer :content="npc.personality" />
          </div>
          <div v-if="npc.backstory" class="flex flex-col gap-1">
            <h3 class="text-label-lg font-bold uppercase text-primary">Backstory</h3>
            <RichTextViewer :content="npc.backstory" />
          </div>
          <div v-if="npc.notes" class="flex flex-col gap-1">
            <h3 class="text-label-lg font-bold uppercase text-muted-foreground">DM Notes</h3>
            <RichTextViewer :content="npc.notes" />
          </div>
          <p
            v-if="!npc.appearance && !npc.personality && !npc.backstory && !npc.notes"
            class="text-body italic text-muted-foreground"
          >
            No lore recorded for this NPC.
          </p>
        </div>
      </NpcAccordionSection>

      <NpcAccordionSection v-model:open="openSections.inventory" title="Inventory">
        <NpcInventorySection :npc-id="npc.id" :npc-name="displayName" />
      </NpcAccordionSection>

      <NpcAccordionSection v-model:open="openSections.relations" title="Relations">
        <NpcRelationsSection :npc-id="npc.id" />
      </NpcAccordionSection>

      <NpcAccordionSection v-model:open="openSections.combat" title="Combat">
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
      </NpcAccordionSection>

      <NpcAccordionSection v-model:open="openSections.voice" title="Voice Coach">
        <NpcVoiceCoach :npc="npc" />
      </NpcAccordionSection>
    </div>

    <!-- ── 6. Fixed bottom action bar ─────────────────────────────────────── -->
    <div
      class="fixed inset-x-0 bottom-0 z-30 flex items-center gap-2 border-t border-border bg-background/95 px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur-md"
    >
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
    </div>
  </div>

  <!-- Overflow ⋮ sheet — Generate / Scriptorium / Edit tags live in the edit
       form (they require the form to be mounted), so these route into it. -->
  <MobileSheet v-model:open="showMenu" :title="displayName">
    <div class="flex flex-col gap-1 pb-2">
      <AppButton
        :to="`/npcs/${npc.id}?edit=true`"
        variant="menu"
        size="body"
        block
        press="muted"
        class="hover:bg-transparent"
        :icon="IconGenerate"
        icon-size="md"
        label="Generate with AI"
        @click="showMenu = false"
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
        @click="showMenu = false"
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
        @click="showMenu = false"
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
    </div>
  </MobileSheet>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from "vue";
import { useRouter } from "vue-router";
import { useScroll } from "@vueuse/core";
import FocalImage from "@/components/common/FocalImage.vue";
import RichTextViewer from "@/components/common/RichTextViewer.vue";
import StatBlockPanel from "@/components/common/StatBlockPanel.vue";
import TraitList from "@/components/common/TraitList.vue";
import SpellcastingList from "@/components/common/SpellcastingList.vue";
import MobileSheet from "@/components/common/MobileSheet.vue";
import AppButton from "@/components/common/AppButton.vue";
import { ICON_TOUCH_TARGET } from "@/components/common/appButtonVariants";
import NpcInventorySection from "@/components/npcs/NpcInventorySection.vue";
import NpcRelationsSection from "@/components/npcs/NpcRelationsSection.vue";
import NpcQuickFact from "@/components/npcs/NpcQuickFact.vue";
import NpcAccordionSection from "@/components/npcs/NpcAccordionSection.vue";
import NpcRevealControl from "@/components/npcs/NpcRevealControl.vue";
import NpcVoiceCoach from "@/components/npcs/NpcVoiceCoach.vue";
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
import { NPC_RELATIONSHIP_LABELS, type Npc } from "@/types/npc.types";

const { npc } = defineProps<{ npc: Npc }>();

const router = useRouter();

// ── Scroll-driven app bar ──────────────────────────────────────────────────────
// The root fills the DefaultLayout <main> (which has no padding of its own) and
// owns its own scroll (h-full + overflow-y-auto) so the fixed app bar + bottom
// bar sit against the viewport edges and useScroll tracks the right element.
const scrollRoot = ref<HTMLElement | null>(null);
const { y: scrollY } = useScroll(scrollRoot);
const scrolled = computed(() => scrollY.value > 150);

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
  inventory: false,
  relations: false,
  combat: false,
  voice: false,
});

// ── Sheets ───────────────────────────────────────────────────────────────────
const showMenu = ref(false);

// ── Delete ───────────────────────────────────────────────────────────────────
const { mutateAsync: deleteNpc } = useDeleteNpc();
async function onDelete() {
  if (!confirm(`Delete "${displayName.value}"? This cannot be undone.`)) return;
  await deleteNpc(npc);
  // Post-mutation navigation: list view is the success feedback.
  void router.push("/npcs");
}

function goBack() {
  if (window.history.length > 1) router.back();
  else void router.push("/npcs");
}
</script>

<style scoped>
/* Hero gradient fading into the page background. Uses the theme background var
   so it tracks light/dark themes. Kept in <style> because Tailwind cannot
   express a transparent → var() vertical gradient as a single utility. */
.hero-fade {
  background: linear-gradient(to bottom, transparent, var(--background) 92%);
}
</style>
