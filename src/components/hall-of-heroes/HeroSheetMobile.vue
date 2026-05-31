<template>
  <!--
    Mobile-only (<md) Hall of Heroes read screen. Rendered by HeroDetailView
    when useMediaQuery("(max-width: 767px)") is true; the desktop layout is
    shown otherwise, byte-identical to before.

    Scroll layout top → bottom:
      1. transparent glass app bar over the hero (solidifies on scroll)
      2. full-bleed hero portrait + badges + name + subtitle
      3. 2×2 quick-facts grid (race / alignment / occupation / setting)
      4. wrapping tags row
      5. accordion sections (Lore open by default; Combat if stat_block present)
      6. fixed bottom action bar (Add to Campaign + overflow ⋮)
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
        aria-label="Back to Hall of Heroes"
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
        class="min-w-0 flex-1 truncate text-center font-cinzel text-base font-bold text-foreground transition-opacity duration-200"
        :class="scrolled ? 'opacity-100' : 'opacity-0'"
      >
        {{ hero.name }}
      </h1>

      <div class="flex shrink-0 items-center gap-2">
        <!-- Admin-only: edit button -->
        <RouterLink
          v-if="isAppAdmin"
          :to="`/hall-of-heroes/${hero.id}/edit`"
          class="flex size-10 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-sm transition-colors active:bg-black/60"
          :class="scrolled && 'bg-transparent text-foreground active:bg-muted'"
          aria-label="Edit hero"
        >
          <IconEdit class="size-5" />
        </RouterLink>

        <!-- Overflow ⋮ -->
        <button
          type="button"
          class="flex size-10 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-sm transition-colors active:bg-black/60"
          :class="scrolled && 'bg-transparent text-foreground active:bg-muted'"
          aria-label="More actions"
          @click="showMenu = true"
        >
          <svg class="size-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <circle cx="12" cy="5" r="1.6" />
            <circle cx="12" cy="12" r="1.6" />
            <circle cx="12" cy="19" r="1.6" />
          </svg>
        </button>
      </div>
    </header>

    <!-- ── 2. Hero portrait ──────────────────────────────────────────────── -->
    <div class="relative h-80 w-full overflow-hidden bg-muted">
      <FocalImage
        :src="hero.portrait_url"
        :alt="hero.name"
        format="portrait"
        :focal-point="hero.portrait_focal_point"
        :render-width="600"
        placeholder="/assets/placeholders/npc.webp"
        class="absolute inset-0"
      />
      <!-- Gradient fading into the page background -->
      <div class="hero-fade pointer-events-none absolute inset-x-0 bottom-0 h-2/3" />

      <!-- Overlaid identity -->
      <div class="absolute inset-x-0 bottom-0 flex flex-col gap-1.5 px-4 pb-3">
        <div class="flex flex-wrap items-center gap-1.5">
          <span
            class="rounded px-2 py-0.5 font-cinzel text-2xs font-bold uppercase tracking-wider text-white"
            :style="{ backgroundColor: statusColor + 'EE' }"
          >
            {{ hero.status }}
          </span>
          <span
            class="rounded bg-black/55 px-2 py-0.5 font-cinzel text-2xs font-bold uppercase tracking-wider text-white"
          >
            {{ settingLabel }}
          </span>
        </div>

        <h2 class="font-cinzel text-3xl font-bold leading-tight text-white drop-shadow-sm">
          {{ hero.name }}
        </h2>

        <p v-if="subtitle" class="font-fell text-sm italic text-white/85 drop-shadow-sm">
          {{ subtitle }}
        </p>
      </div>
    </div>

    <!-- ── Body ─────────────────────────────────────────────────────────── -->
    <div class="flex flex-col gap-4 bg-background px-4 pt-4 pb-32">
      <!-- 3. Quick-facts grid (2×2, hairline-separated) -->
      <div
        v-if="hasAnyQuickFact"
        class="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border"
      >
        <MobileQuickFact label="Species" :value="hero.race" class="bg-card" />
        <MobileQuickFact label="Alignment" :value="hero.alignment" class="bg-card" />
        <MobileQuickFact label="Occupation" :value="hero.occupation" class="bg-card" />
        <MobileQuickFact label="Age" :value="hero.age" class="bg-card" />
      </div>

      <!-- 4. Tags -->
      <div v-if="hero.tags?.length" class="flex flex-wrap gap-1.5">
        <span
          v-for="tag in hero.tags"
          :key="tag"
          class="rounded-full bg-muted px-2.5 py-1 font-cinzel text-2xs tracking-wider text-muted-foreground"
        >
          {{ tag }}
        </span>
      </div>

      <!-- 5. Accordion sections -->
      <MobileAccordionSection v-model:open="openSections.lore" title="Lore">
        <div class="flex flex-col gap-4">
          <div v-if="hero.appearance" class="flex flex-col gap-1">
            <h3 class="font-cinzel text-xs font-bold uppercase tracking-wider text-primary">Appearance</h3>
            <RichTextViewer :content="hero.appearance" />
          </div>
          <div v-if="hero.personality" class="flex flex-col gap-1">
            <h3 class="font-cinzel text-xs font-bold uppercase tracking-wider text-primary">Personality</h3>
            <RichTextViewer :content="hero.personality" />
          </div>
          <div v-if="hero.backstory" class="flex flex-col gap-1">
            <h3 class="font-cinzel text-xs font-bold uppercase tracking-wider text-primary">Backstory</h3>
            <RichTextViewer :content="hero.backstory" />
          </div>
          <div v-if="hero.notes && isAppAdmin" class="flex flex-col gap-1">
            <h3 class="font-cinzel text-xs font-bold uppercase tracking-wider text-muted-foreground">DM Notes</h3>
            <RichTextViewer :content="hero.notes" />
          </div>
          <p
            v-if="!hero.appearance && !hero.personality && !hero.backstory"
            class="font-fell text-sm italic text-muted-foreground"
          >
            No lore recorded for this hero.
          </p>
        </div>
      </MobileAccordionSection>

      <MobileAccordionSection
        v-if="hero.stat_block"
        v-model:open="openSections.combat"
        title="Combat"
      >
        <div class="flex flex-col gap-4">
          <StatBlockPanel :sb="hero.stat_block" />
          <TraitList title="Special Abilities" :traits="hero.stat_block.special_abilities" />
          <SpellcastingList :spellcasting="hero.stat_block.spellcasting" />
          <TraitList title="Actions" :traits="hero.stat_block.actions" />
          <TraitList title="Bonus Actions" :traits="hero.stat_block.bonus_actions" />
          <TraitList title="Reactions" :traits="hero.stat_block.reactions" />
          <TraitList title="Legendary Actions" :traits="hero.stat_block.legendary_actions" />
          <TraitList title="Lair Actions" :traits="hero.stat_block.lair_actions" />
        </div>
      </MobileAccordionSection>
    </div>

    <!-- ── 6. Fixed bottom action bar ─────────────────────────────────────── -->
    <div
      class="fixed inset-x-0 bottom-0 z-30 flex items-center gap-2 border-t border-border bg-background/95 px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur-md"
    >
      <button
        type="button"
        :disabled="!hasCampaign || isImporting"
        :title="hasCampaign ? 'Add to current campaign' : 'No active campaign'"
        class="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary px-4 py-3 font-cinzel text-sm font-bold tracking-wider text-primary-foreground active:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        @click="emit('import')"
      >
        <IconAdd class="size-4" />
        {{ isImporting ? "Adding…" : "Add to Campaign" }}
      </button>
    </div>
  </div>

  <!-- ── Overflow ⋮ sheet ─────────────────────────────────────────────────── -->
  <MobileSheet v-model:open="showMenu" :title="hero.name">
    <div class="flex flex-col gap-1 pb-2">
      <RouterLink
        v-if="isAppAdmin"
        :to="`/hall-of-heroes/${hero.id}/edit`"
        class="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left font-fell text-sm text-foreground active:bg-muted/50"
        @click="showMenu = false"
      >
        <IconEdit class="size-4 shrink-0" /> Edit Hero
      </RouterLink>
      <button
        type="button"
        :disabled="!hasCampaign || isImporting"
        class="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left font-fell text-sm text-foreground active:bg-muted/50 disabled:opacity-50"
        @click="showMenu = false; emit('import')"
      >
        <IconAdd class="size-4 shrink-0" />
        {{ isImporting ? "Adding…" : "Add to Campaign" }}
      </button>
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
import MobileQuickFact from "@/components/common/MobileQuickFact.vue";
import MobileAccordionSection from "@/components/common/MobileAccordionSection.vue";
import { IconAdd, IconEdit } from "@/lib/icons";
import type { HallOfHero } from "@/types/npc.types";
import { DND_SETTINGS } from "@/data/dndSettings";

const { hero, hasCampaign = false, isImporting = false, isAppAdmin = false } = defineProps<{
  hero: HallOfHero;
  hasCampaign?: boolean;
  isImporting?: boolean;
  isAppAdmin?: boolean;
}>();

const emit = defineEmits<{ import: [] }>();

const router = useRouter();

// ── Scroll-driven app bar ─────────────────────────────────────────────────────
const scrollRoot = ref<HTMLElement | null>(null);
const { y: scrollY } = useScroll(scrollRoot);
const scrolled = computed(() => scrollY.value > 150);

// ── Display helpers ───────────────────────────────────────────────────────────
const subtitle = computed(() =>
  [hero.race, hero.occupation].filter(Boolean).join(" · "),
);

const settingLabelMap = Object.fromEntries(DND_SETTINGS.map((s) => [s.value, s.label]));
const settingLabel = computed(() => settingLabelMap[hero.setting] ?? hero.setting);

const STATUS_COLORS: Record<string, string> = {
  alive: "#22c55e",
  dead: "#ef4444",
  missing: "#f59e0b",
  unknown: "#6b7280",
};
const statusColor = computed(() => STATUS_COLORS[hero.status] ?? "#6b7280");

const hasAnyQuickFact = computed(
  () => !!(hero.race || hero.alignment || hero.occupation || hero.age),
);

// ── Accordion state (Lore open by default) ────────────────────────────────────
const openSections = reactive({
  lore: true,
  combat: false,
});

// ── Sheets ───────────────────────────────────────────────────────────────────
const showMenu = ref(false);

function goBack() {
  if (window.history.length > 1) router.back();
  else void router.push("/hall-of-heroes");
}
</script>

<style scoped>
.hero-fade {
  background: linear-gradient(to bottom, transparent, var(--background) 92%);
}
</style>
