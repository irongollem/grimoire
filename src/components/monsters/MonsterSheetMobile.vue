<template>
  <!--
    Mobile-only (<md) monster detail (read) screen. Rendered by
    MonsterDetailView when useMediaQuery("(max-width: 767px)") is true; the
    desktop MonsterSheet is shown otherwise, byte-identical to before.

    Mirrors NpcDetailMobile's structure, with monster-specific differences:
      - CR pill (tinted by crColor) + SRD/source pill over the hero (no status
        dot — monsters have no alive/dead state)
      - quick-facts: Type / Size / Alignment / Habitat
      - accordion: Lore (description + DM notes) + Combat (full stat block);
        no Inventory / Relations sections
      - primary bottom action is Customize for SRD monsters (clones to an
        editable copy), else Edit

    Scroll layout top → bottom:
      1. transparent glass app bar over the hero (solidifies on scroll)
      2. full-bleed hero portrait + CR/SRD badges + name + subtitle
      3. 2×2 quick-facts grid
      4. wrapping tags row
      5. accordion sections (Lore open by default)
      6. fixed bottom action bar (Reveal + Edit/Customize)
      7. Reveal bottom sheet + overflow ⋮ sheet
  -->
  <div ref="scrollRoot" class="relative h-full overflow-y-auto md:hidden">
    <!-- ── 1. App bar (glass, over hero) ──────────────────────────────────── -->
    <header
      class="fixed inset-x-0 top-0 z-30 flex items-center justify-between gap-2 px-3 pt-[calc(env(safe-area-inset-top)+0.5rem)] pb-2 transition-colors duration-200"
      :class="scrolled ? 'border-b border-border bg-background/85 backdrop-blur-md' : ''"
    >
      <button
        type="button"
        class="flex size-10 shrink-0 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-sm transition-colors active:bg-black/60"
        :class="scrolled && 'bg-transparent text-foreground active:bg-muted'"
        aria-label="Back"
        @click="goBack"
      >
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
      </button>

      <!-- Name fades in once scrolled past the hero -->
      <h1
        class="min-w-0 flex-1 truncate text-center text-heading-sm font-bold text-foreground transition-opacity duration-200"
        :class="scrolled ? 'opacity-100' : 'opacity-0'"
      >
        {{ monster.name }}
      </h1>

      <div class="flex shrink-0 items-center gap-2">
        <button
          type="button"
          class="flex size-10 items-center justify-center rounded-full bg-black/40 backdrop-blur-sm transition-colors active:bg-black/60"
          :class="[
            scrolled && 'bg-transparent active:bg-muted',
            isDiscovered ? 'text-primary' : scrolled ? 'text-foreground' : 'text-white',
          ]"
          :aria-label="isDiscovered ? 'Manage sharing' : 'Reveal to players'"
          @click="showReveal = true"
        >
          <component :is="isDiscovered ? IconReveal : IconHide" class="size-5" />
        </button>
        <button
          type="button"
          class="flex size-10 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-sm transition-colors active:bg-black/60"
          :class="scrolled && 'bg-transparent text-foreground active:bg-muted'"
          aria-label="More actions"
          @click="showMenu = true"
        >
          <!-- vertical ellipsis -->
          <svg class="size-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <circle cx="12" cy="5" r="1.6" />
            <circle cx="12" cy="12" r="1.6" />
            <circle cx="12" cy="19" r="1.6" />
          </svg>
        </button>
      </div>
    </header>

    <!-- ── 2. Hero ────────────────────────────────────────────────────────── -->
    <div class="relative h-80 w-full overflow-hidden bg-muted">
      <FocalImage
        :src="monster.image_url"
        :alt="monster.name"
        format="portrait"
        :focal-point="monster.portrait_focal_point"
        :render-width="600"
        placeholder="/assets/placeholders/monster.webp"
        class="absolute inset-0"
      />
      <!-- Gradient fading into the page background -->
      <div class="hero-fade pointer-events-none absolute inset-x-0 bottom-0 h-2/3" />

      <!-- Overlaid identity -->
      <div class="absolute inset-x-0 bottom-0 flex flex-col gap-1.5 px-4 pb-3">
        <div class="flex flex-wrap items-center gap-1.5">
          <span
            class="rounded px-2 py-0.5 text-eyebrow font-bold text-white"
            :style="{ backgroundColor: crColor(monster.stat_block.challenge_rating) }"
          >
            CR {{ monster.stat_block.challenge_rating }}
          </span>
          <span
            v-if="monster.is_srd"
            class="rounded bg-black/55 px-2 py-0.5 text-eyebrow font-bold text-white"
          >
            {{ monster.source_title ?? monster.source ?? "SRD" }}
          </span>
          <span
            v-if="isDiscovered"
            class="flex items-center gap-1 rounded bg-black/55 px-1.5 py-0.5 text-eyebrow font-bold text-primary"
          >
            <IconReveal class="size-3" /> Shared
          </span>
        </div>

        <h2 class="text-display font-bold leading-tight text-white drop-shadow-sm">
          {{ monster.name }}
        </h2>

        <p class="text-body italic capitalize text-white/85 drop-shadow-sm">
          {{ subtitle }}
        </p>
      </div>
    </div>

    <!-- ── Body ───────────────────────────────────────────────────────────── -->
    <div class="flex flex-col gap-4 bg-background px-4 pt-4 pb-32">
      <!-- 3. Quick-facts grid (2×2, hairline-separated) -->
      <div class="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border">
        <NpcQuickFact label="Type" :value="monster.monster_type" class="bg-card capitalize" />
        <NpcQuickFact label="Size" :value="monster.size" class="bg-card capitalize" />
        <NpcQuickFact label="Alignment" :value="monster.alignment" class="bg-card capitalize" />
        <NpcQuickFact label="Habitat" :value="monster.habitat" class="bg-card" />
      </div>

      <!-- Lair location link -->
      <RouterLink
        v-if="lairLocation"
        :to="`/locations/${lairLocation.id}`"
        class="flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-3 text-label-lg text-muted-foreground"
      >
        <IconLocation class="size-4 shrink-0 text-primary/70" />
        Lair: {{ lairLocation.name }}
      </RouterLink>

      <!-- 4. Tags -->
      <div v-if="monster.tags?.length" class="flex flex-wrap gap-1.5">
        <span
          v-for="tag in monster.tags"
          :key="tag"
          class="rounded-full bg-muted px-2.5 py-1 text-label text-muted-foreground"
        >
          {{ tag }}
        </span>
      </div>

      <!-- 5. Accordion sections -->
      <NpcAccordionSection v-model:open="openSections.lore" title="Lore">
        <div class="flex flex-col gap-4">
          <div v-if="monster.description" class="flex flex-col gap-1">
            <h3 class="text-label-lg font-bold uppercase text-primary">Description</h3>
            <RichTextViewer :content="monster.description" />
          </div>
          <div v-if="monster.notes" class="flex flex-col gap-1">
            <h3 class="text-label-lg font-bold uppercase text-muted-foreground">DM Notes</h3>
            <RichTextViewer :content="monster.notes" />
          </div>
          <p
            v-if="!monster.description && !monster.notes"
            class="text-body italic text-muted-foreground"
          >
            No lore recorded for this monster.
          </p>
        </div>
      </NpcAccordionSection>

      <NpcAccordionSection v-model:open="openSections.combat" title="Combat">
        <div class="flex flex-col gap-4">
          <StatBlockPanel :sb="monster.stat_block" />
          <TraitList title="Special Abilities" :traits="monster.stat_block.special_abilities" />
          <SpellcastingList :spellcasting="monster.stat_block.spellcasting" />
          <TraitList title="Actions" :traits="monster.stat_block.actions" />
          <TraitList title="Bonus Actions" :traits="monster.stat_block.bonus_actions" />
          <TraitList title="Reactions" :traits="monster.stat_block.reactions" />
          <TraitList title="Legendary Actions" :traits="monster.stat_block.legendary_actions" />
          <TraitList title="Lair Actions" :traits="monster.stat_block.lair_actions" />
        </div>
      </NpcAccordionSection>
    </div>

    <!-- ── 6. Fixed bottom action bar ─────────────────────────────────────── -->
    <div
      class="fixed inset-x-0 bottom-0 z-30 flex items-center gap-2 border-t border-border bg-background/95 px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur-md"
    >
      <button
        type="button"
        class="flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-3 font-cinzel text-sm font-bold tracking-wider transition-colors"
        :class="isDiscovered
          ? 'border-primary/50 bg-primary/10 text-primary'
          : 'border-border text-foreground active:bg-muted'"
        @click="showReveal = true"
      >
        <component :is="isDiscovered ? IconReveal : IconHide" class="size-4" />
        <span v-if="sharedCount">Shared · {{ sharedCount }}</span>
        <span v-else>Reveal</span>
      </button>

      <!-- SRD monsters clone to an editable copy (Customize); custom monsters edit -->
      <button
        v-if="monster.is_srd"
        type="button"
        :disabled="cloning"
        class="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary px-4 py-3 font-cinzel text-sm font-bold tracking-wider text-primary-foreground active:opacity-90 disabled:opacity-50"
        @click="customize"
      >
        <IconCopy class="size-4" />
        {{ cloning ? "Copying…" : "Customize" }}
      </button>
      <RouterLink
        v-else
        :to="`/monsters/${monster.id}?edit=true`"
        class="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary px-4 py-3 font-cinzel text-sm font-bold tracking-wider text-primary-foreground active:opacity-90"
      >
        <IconEdit class="size-4" />
        Edit
      </RouterLink>
    </div>
  </div>

  <!-- ── 7. Reveal bottom sheet ───────────────────────────────────────────── -->
  <MonsterRevealSheet v-model:open="showReveal" :monster="monster" />

  <!-- Overflow ⋮ sheet — Send to Scriptorium / Delete live in the edit form
       (they require the form to be mounted), so these route into it. Duplicate
       is offered for custom monsters only (SRD uses Customize above). -->
  <MobileSheet v-model:open="showMenu" :title="monster.name">
    <div class="flex flex-col gap-1 pb-2">
      <RouterLink
        v-if="!monster.is_srd"
        :to="`/monsters/${monster.id}?edit=true`"
        class="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-body text-foreground active:bg-muted/50"
        @click="showMenu = false"
      >
        <IconCopy class="size-4 shrink-0" /> Duplicate
      </RouterLink>
      <RouterLink
        :to="`/monsters/${monster.id}?edit=true`"
        class="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-body text-foreground active:bg-muted/50"
        @click="showMenu = false"
      >
        <IconScrollText class="size-4 shrink-0" /> Send to Scriptorium
      </RouterLink>
      <button
        v-if="!monster.is_srd"
        type="button"
        class="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-body text-destructive active:bg-destructive/10"
        @click="onDelete"
      >
        <IconDelete class="size-4 shrink-0" /> Delete monster
      </button>
    </div>
  </MobileSheet>
</template>

<script setup lang="ts">
import { computed, reactive, ref, toRef } from "vue";
import { useRouter } from "vue-router";
import { useScroll } from "@vueuse/core";
import FocalImage from "@/components/common/FocalImage.vue";
import RichTextViewer from "@/components/common/RichTextViewer.vue";
import StatBlockPanel from "@/components/common/StatBlockPanel.vue";
import TraitList from "@/components/common/TraitList.vue";
import SpellcastingList from "@/components/common/SpellcastingList.vue";
import MobileSheet from "@/components/common/MobileSheet.vue";
import NpcQuickFact from "@/components/npcs/NpcQuickFact.vue";
import NpcAccordionSection from "@/components/npcs/NpcAccordionSection.vue";
import MonsterRevealSheet from "@/components/monsters/MonsterRevealSheet.vue";
import { IconCopy, IconDelete, IconEdit, IconHide, IconLocation, IconReveal, IconScrollText } from "@/lib/icons";
import { useCloneSrdMonster, useDeleteMonster } from "@/composables/useMonsters";
import { useLocationTree } from "@/composables/useLocations";
import { useMonsterVisibility } from "@/composables/useMonsterVisibility";
import { crColor } from "@/lib/monsterDisplay";
import type { Monster } from "@/types/monster.types";

const { monster } = defineProps<{ monster: Monster }>();

const router = useRouter();

// ── Scroll-driven app bar ──────────────────────────────────────────────────────
const scrollRoot = ref<HTMLElement | null>(null);
const { y: scrollY } = useScroll(scrollRoot);
const scrolled = computed(() => scrollY.value > 150);

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
const { isDiscovered, currentDiscovery } = useMonsterVisibility(toRef(() => monster));
const sharedCount = computed(() => {
  const d = currentDiscovery.value;
  if (!d) return 0;
  // null visible_to = whole party (legacy); show 0-suppressed "Shared" label
  return d.visible_to?.length ?? 0;
});

// ── Accordion state (Lore open by default) ──────────────────────────────────────
const openSections = reactive({
  lore: true,
  combat: false,
});

// ── Sheets ───────────────────────────────────────────────────────────────────
const showReveal = ref(false);
const showMenu = ref(false);

// ── Customize (SRD → editable clone) — mirrors MonsterDetail/MonsterSheet ───────
const { mutateAsync: clone } = useCloneSrdMonster();
const cloning = ref(false);
async function customize() {
  if (!monster.is_srd) return;
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

function goBack() {
  if (window.history.length > 1) router.back();
  else void router.push("/monsters");
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
