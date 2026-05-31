<template>
  <!--
    Mobile-only (<md) spell detail (read) screen. Rendered by SpellDetailView
    when useMediaQuery("(max-width: 767px)") is true; the desktop SpellSheet is
    shown otherwise, byte-identical to before.

    Spells usually have no portrait, so the "hero" is a themed school-coloured
    gradient band carrying the name + "Level N · School" subtitle (with a
    FocalImage layered behind it when the spell does have art). Spell-specific
    differences vs. NPC/Monster:
      - gradient hero instead of a forced portrait
      - level + school identity; concentration / ritual chips
      - quick-facts: Casting Time / Range / Components / Duration
      - a classes chip row + "Known By" party members
      - no DM reveal-eye (spells use a "known by player" model, not a reveal)
      - SRD spells are art-only; Edit still opens the (art-only) edit form

    Scroll layout top → bottom:
      1. transparent glass app bar over the hero (solidifies on scroll)
      2. school-gradient hero + level/SRD badges + name + subtitle + flag chips
      3. 2×2 quick-facts grid
      4. classes chip row
      5. accordion sections (Description open by default)
      6. fixed bottom action bar (Edit)
      7. overflow ⋮ sheet
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
        class="min-w-0 flex-1 truncate text-center font-cinzel text-base font-bold text-foreground transition-opacity duration-200"
        :class="scrolled ? 'opacity-100' : 'opacity-0'"
      >
        {{ spell.name }}
      </h1>

      <button
        type="button"
        class="flex size-10 shrink-0 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-sm transition-colors active:bg-black/60"
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
    </header>

    <!-- ── 2. Hero (school-gradient band, optional art behind) ────────────── -->
    <div
      class="hero-band relative h-56 w-full overflow-hidden"
      :style="{ '--school': schoolColor }"
    >
      <FocalImage
        v-if="spell.image_url"
        :src="spell.image_url"
        :alt="spell.name"
        format="landscape"
        :focal-point="spell.image_focal_point"
        :render-width="600"
        class="absolute inset-0 opacity-50"
      />
      <!-- Gradient fading into the page background -->
      <div class="hero-fade pointer-events-none absolute inset-x-0 bottom-0 h-2/3" />

      <!-- Overlaid identity -->
      <div class="absolute inset-x-0 bottom-0 flex flex-col gap-1.5 px-4 pb-3">
        <div class="flex flex-wrap items-center gap-1.5">
          <span
            class="rounded px-2 py-0.5 font-cinzel text-2xs font-bold uppercase tracking-wider text-white"
            :style="{ backgroundColor: schoolColor + 'EE' }"
          >
            {{ levelLabel }}
          </span>
          <span
            v-if="spell.concentration"
            class="rounded bg-black/55 px-2 py-0.5 font-cinzel text-2xs font-bold uppercase tracking-wider text-white"
          >
            Concentration
          </span>
          <span
            v-if="spell.ritual"
            class="rounded bg-black/55 px-2 py-0.5 font-cinzel text-2xs font-bold uppercase tracking-wider text-white"
          >
            Ritual
          </span>
          <span
            v-if="isSrd"
            class="rounded bg-black/55 px-2 py-0.5 font-cinzel text-2xs font-bold uppercase tracking-wider text-white"
          >
            {{ sourceLabel }}
          </span>
        </div>

        <h2 class="font-cinzel text-3xl font-bold leading-tight text-white drop-shadow-sm">
          {{ spell.name }}
        </h2>

        <p class="font-fell text-sm italic capitalize text-white/85 drop-shadow-sm">
          {{ subtitle }}
        </p>
      </div>
    </div>

    <!-- ── Body ───────────────────────────────────────────────────────────── -->
    <div class="flex flex-col gap-4 bg-background px-4 pt-4 pb-32">
      <!-- 3. Quick-facts grid (2×2, hairline-separated) -->
      <div class="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border">
        <MobileQuickFact label="Casting Time" :value="castingTime" class="bg-card" />
        <MobileQuickFact label="Range" :value="range" class="bg-card" />
        <MobileQuickFact label="Components" :value="componentsLine" class="bg-card" />
        <MobileQuickFact label="Duration" :value="duration" class="bg-card" />
      </div>

      <!-- Material component (only with M) -->
      <p v-if="spell.material" class="font-fell text-xs italic text-muted-foreground">
        Material: {{ spell.material }}
      </p>

      <!-- 4. Classes chip row -->
      <div v-if="spell.classes?.length" class="flex flex-wrap gap-1.5">
        <span
          v-for="cls in spell.classes"
          :key="cls"
          class="rounded-full bg-muted px-2.5 py-1 font-cinzel text-2xs tracking-wider text-muted-foreground"
        >
          {{ cls }}
        </span>
      </div>

      <!-- Tags -->
      <div v-if="spell.tags?.length" class="flex flex-wrap gap-1.5">
        <span
          v-for="tag in spell.tags"
          :key="tag"
          class="rounded-full bg-primary/10 px-2.5 py-1 font-cinzel text-2xs tracking-wider text-primary"
        >
          {{ tag }}
        </span>
      </div>

      <!-- 5. Accordion sections -->
      <MobileAccordionSection v-model:open="openSections.description" title="Description">
        <RichTextViewer :content="spell.description" />
      </MobileAccordionSection>

      <MobileAccordionSection
        v-if="spell.higher_levels"
        v-model:open="openSections.higher"
        title="At Higher Levels"
      >
        <RichTextViewer :content="spell.higher_levels" />
      </MobileAccordionSection>

      <!-- Known By party members -->
      <div v-if="knowers?.length" class="flex flex-col gap-2">
        <h3 class="font-cinzel text-xs font-bold uppercase tracking-wider text-muted-foreground">
          Known By
        </h3>
        <div class="flex flex-wrap gap-1.5">
          <span
            v-for="k in knowers"
            :key="k.party_member_id"
            class="inline-flex items-center gap-1 rounded bg-muted px-2 py-0.5 font-cinzel text-2xs text-muted-foreground"
          >
            <IconParty class="size-2.5 shrink-0" />
            {{ k.name }}
            <span v-if="k.is_prepared" class="text-primary">· prepared</span>
          </span>
        </div>
      </div>
    </div>

    <!-- ── 6. Fixed bottom action bar ─────────────────────────────────────── -->
    <div
      class="fixed inset-x-0 bottom-0 z-30 flex items-center gap-2 border-t border-border bg-background/95 px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur-md"
    >
      <RouterLink
        :to="`/spells/${spell.id}?edit=true`"
        class="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary px-4 py-3 font-cinzel text-sm font-bold tracking-wider text-primary-foreground active:opacity-90"
      >
        <IconEdit class="size-4" />
        {{ isSrd ? "Edit Art" : "Edit" }}
      </RouterLink>
    </div>
  </div>

  <!-- ── 7. Overflow ⋮ sheet — Send to Scriptorium / Delete live in the edit
       form (they require the form to be mounted), so these route into it.
       Delete is offered for custom spells only (SRD spells are art-only). -->
  <MobileSheet v-model:open="showMenu" :title="spell.name">
    <div class="flex flex-col gap-1 pb-2">
      <RouterLink
        :to="`/spells/${spell.id}?edit=true`"
        class="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left font-fell text-sm text-foreground active:bg-muted/50"
        @click="showMenu = false"
      >
        <IconScrollText class="size-4 shrink-0" /> Send to Scriptorium
      </RouterLink>
      <button
        v-if="!isSrd"
        type="button"
        class="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left font-fell text-sm text-destructive active:bg-destructive/10"
        @click="onDelete"
      >
        <IconDelete class="size-4 shrink-0" /> Delete spell
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
import MobileSheet from "@/components/common/MobileSheet.vue";
import MobileQuickFact from "@/components/common/MobileQuickFact.vue";
import MobileAccordionSection from "@/components/common/MobileAccordionSection.vue";
import { IconDelete, IconEdit, IconParty, IconScrollText } from "@/lib/icons";
import { useDeleteSpell } from "@/composables/useSpells";
import { useSpellKnowers } from "@/composables/useCharacterSpells";
import { SCHOOL_COLORS, spellLevelLabel, spellSourceLabel } from "@/types/spell.types";
import type { Spell } from "@/types/spell.types";

const { spell } = defineProps<{ spell: Spell }>();

const router = useRouter();

// ── Scroll-driven app bar ──────────────────────────────────────────────────────
const scrollRoot = ref<HTMLElement | null>(null);
const { y: scrollY } = useScroll(scrollRoot);
const scrolled = computed(() => scrollY.value > 120);

// ── SRD detection (mirrors SpellDetailView's isSrdId) ───────────────────────────
const isSrd = computed(() => spell.id.startsWith("srd_"));

// ── Display helpers (mirror the desktop sheet) ──────────────────────────────────
const schoolColor = computed(() => SCHOOL_COLORS[spell.school] ?? "#6b7280");
const levelLabel = computed(() => (spell.level === 0 ? "Cantrip" : spellLevelLabel(spell.level)));
const subtitle = computed(() => `${levelLabel.value} · ${spell.school}`);
const sourceLabel = computed(() => spellSourceLabel(spell.source, spell.source_title));

// Custom values take precedence, matching SpellSheet's desktop display.
const castingTime = computed(() => spell.casting_time_custom || spell.casting_time);
const range = computed(() => spell.range_custom || spell.range);
const duration = computed(() => spell.duration_custom || spell.duration);
const componentsLine = computed(() => spell.components.join(", ") || "—");

// ── Known By (party members) ────────────────────────────────────────────────────
const { data: knowers } = useSpellKnowers(computed(() => spell.id));

// ── Accordion state (Description open by default) ───────────────────────────────
const openSections = reactive({
  description: true,
  higher: false,
});

// ── Sheets ───────────────────────────────────────────────────────────────────
const showMenu = ref(false);

// ── Delete ───────────────────────────────────────────────────────────────────
const { mutateAsync: deleteSpell } = useDeleteSpell();
async function onDelete() {
  if (!confirm(`Delete "${spell.name}"? This cannot be undone.`)) return;
  await deleteSpell(spell);
  // Post-mutation navigation: list view is the success feedback.
  void router.push("/spells");
}

function goBack() {
  if (window.history.length > 1) router.back();
  else void router.push("/spells");
}
</script>

<style scoped>
/* School-tinted hero band: a vertical wash of the school colour over the page
   background. The colour comes in via the --school custom property so it tracks
   the spell's school; kept in <style> because Tailwind cannot express a
   var()-driven multi-stop gradient as a single utility. */
.hero-band {
  background: linear-gradient(
    160deg,
    color-mix(in srgb, var(--school) 60%, transparent),
    color-mix(in srgb, var(--school) 18%, var(--background))
  );
}

/* Gradient fading into the page background so the body blends with the hero. */
.hero-fade {
  background: linear-gradient(to bottom, transparent, var(--background) 92%);
}
</style>
