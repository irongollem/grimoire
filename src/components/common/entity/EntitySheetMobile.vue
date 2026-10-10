<template>
  <!--
    The shared shell of the phone (<md) read sheets: MonsterSheetMobile,
    NpcDetailMobile and SpellSheetMobile. Each used to carry its own copy of
    this structure; the entity now supplies only what is specific to it.

    Scroll layout top → bottom:
      1. transparent glass app bar over the hero (solidifies on scroll)
      2. full-bleed hero portrait + pills + name + subtitle
      3. quick-facts grid          (slot `facts`)
      4. wrapping tags row         (prop `tags`)
      5. sections                  (default slot)
      6. fixed bottom action bar   (slot `bottom-bar`)
      7. overflow ⋮ sheet          (slot `menu`; no slot, no ⋮ button)

    The root owns its own scroll (h-full + overflow-y-auto) so the fixed app bar
    and bottom bar sit against the viewport edges and useScroll tracks the right
    element. The page body fills with `bg-background` because this element IS
    the page (see pageBackgroundToken.test.ts).
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
        :class="[ICON_TOUCH_TARGET, 'shrink-0 backdrop-blur-sm', barButtonClass]"
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
        {{ name }}
      </h1>

      <div class="flex shrink-0 items-center gap-2">
        <!--
          Controls that sit in the bar (a reveal control). What is behind them
          changes as you scroll, so they get `scrolled`: over the hero a control
          needs the scrim to stay legible on the art, and once the bar solidifies
          into light glass that same scrim is a black pill on a pale bar.
        -->
        <slot name="bar-actions" :scrolled="scrolled" />
        <AppButton
          v-if="$slots.menu"
          variant="ghost"
          size="icon-xs"
          shape="pill"
          press="muted"
          :class="[ICON_TOUCH_TARGET, 'backdrop-blur-sm', barButtonClass]"
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
        :src="image"
        :alt="name"
        format="portrait"
        :focal-point="focalPoint"
        :render-width="600"
        :placeholder="placeholder"
        class="absolute inset-0"
        ai-badge="right"
        ai-badge-class="z-10"
      />
      <!-- Gradient fading into the page background -->
      <div class="hero-fade pointer-events-none absolute inset-x-0 bottom-0 h-2/3" />

      <!--
        Overlaid identity. The AI chip sits in the hero's bottom-right corner,
        the only part of the hero that neither the fixed app bar (top, with the
        More and Reveal buttons) nor the scroll-away name covers; `pr-12` keeps
        long names and subtitles from running underneath it. The chip lives in
        FocalImage, which paints before the fade and this block, so it carries
        `z-10` to stay on top of both.
      -->
      <div class="absolute inset-x-0 bottom-0 flex flex-col gap-1.5 pr-12 pl-4 pb-3">
        <div v-if="$slots.pills" class="flex flex-wrap items-center gap-1.5">
          <slot name="pills" />
        </div>

        <h2 class="text-display font-bold leading-tight text-white drop-shadow-sm">
          {{ name }}
        </h2>

        <p v-if="subtitle" class="text-body italic text-white/85 drop-shadow-sm" :class="subtitleClass">
          {{ subtitle }}
        </p>

        <!-- Anything more that belongs to the identity (a disguise line). -->
        <slot name="identity" />
      </div>
    </div>

    <!-- ── Body ───────────────────────────────────────────────────────────── -->
    <div class="flex flex-col gap-4 bg-background px-4 pt-4 pb-32">
      <!-- 3. Quick-facts grid (2-col, hairline-separated) -->
      <div
        v-if="$slots.facts"
        class="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border"
      >
        <slot name="facts" />
      </div>

      <slot name="after-facts" />

      <!-- 4. Tags -->
      <div v-if="tags?.length" class="flex flex-wrap gap-1.5">
        <span
          v-for="tag in tags"
          :key="tag"
          class="rounded-full bg-muted px-2.5 py-1 text-label text-muted-foreground"
        >
          {{ tag }}
        </span>
      </div>

      <!-- 5. Sections -->
      <slot />
    </div>

    <!-- ── 6. Fixed bottom action bar ─────────────────────────────────────── -->
    <div
      v-if="$slots['bottom-bar']"
      class="fixed inset-x-0 bottom-0 z-30 flex items-center gap-2 border-t border-border bg-background/95 px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur-md"
    >
      <slot name="bottom-bar" />
    </div>
  </div>

  <!-- 7. Overflow ⋮ sheet. `close` is handed to the slot so a row can dismiss it. -->
  <MobileSheet v-if="$slots.menu" v-model:open="showMenu" :title="name">
    <div class="flex flex-col gap-1 pb-2">
      <slot name="menu" :close="closeMenu" />
    </div>
  </MobileSheet>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { useRouter } from "vue-router";
import { useScroll } from "@vueuse/core";
import AppButton from "@/components/common/controls/AppButton.vue";
import { ICON_TOUCH_TARGET } from "@/components/common/controls/appButtonVariants";
import FocalImage from "@/components/common/media/FocalImage.vue";
import MobileSheet from "@/components/common/overlays/MobileSheet.vue";

const { backTo } = defineProps<{
  /** Where Back goes when there is no history to return to. */
  backTo: string;
  /** Shown in the hero, and in the app bar once scrolled past it. */
  name: string;
  subtitle?: string;
  /** Extra classes for the subtitle line (monsters capitalise theirs). */
  subtitleClass?: string;
  image?: string | null;
  focalPoint?: { x: number; y: number } | null;
  placeholder: string;
  tags?: string[] | null;
}>();

const router = useRouter();

// ── Scroll-driven app bar ──────────────────────────────────────────────────────
const scrollRoot = ref<HTMLElement | null>(null);
const { y: scrollY } = useScroll(scrollRoot);
const scrolled = computed(() => scrollY.value > 150);

/** Over the hero: a scrimmed white glyph. On the solid bar: plain foreground. */
const barButtonClass = computed(() =>
  scrolled.value ? "text-foreground" : "bg-black/40 text-white hover:text-white active:bg-black/60",
);

const showMenu = ref(false);
function closeMenu() {
  showMenu.value = false;
}

function goBack() {
  if (window.history.length > 1) router.back();
  else void router.push(backTo);
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
