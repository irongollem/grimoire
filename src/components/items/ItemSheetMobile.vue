<template>
  <!--
    Mobile-only (<md) item (Vault) detail (read) screen. Rendered by
    ItemDetailView when useMediaQuery("(max-width: 767px)") is true; the desktop
    ItemSheet is shown otherwise, byte-identical to before.

    Mirrors NpcDetailMobile / MonsterSheetMobile structure, with item-specific
    differences:
      - rarity pill (tinted by RARITY_BADGE_COLORS) + attunement indicator +
        source/SRD pill over the hero (no status dot — items have no state)
      - quick-facts: Type / Rarity / Value / Weight
      - accordion: Description (open by default) + Properties (weapon/armor/
        charges) + Mundane Description + DM Notes + Curse
      - items have no player-reveal eye; instead the app bar carries a Send /
        distribute action (ItemSendSheet), and the bottom bar's left button is
        Send. SRD/imported items offer Clone (Customize) like Monsters.

    Scroll layout top → bottom:
      1. transparent glass app bar over the hero (solidifies on scroll)
      2. full-bleed hero portrait + rarity/attunement/source badges + name + subtitle
      3. 2×2 quick-facts grid
      4. wrapping tags row
      5. accordion sections (Description open by default)
      6. fixed bottom action bar (Send + Edit)
      7. Send bottom sheet + overflow ⋮ sheet
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
        {{ item.name }}
      </h1>

      <div class="flex shrink-0 items-center gap-2">
        <button
          type="button"
          class="flex size-10 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-sm transition-colors active:bg-black/60"
          :class="scrolled && 'bg-transparent text-foreground active:bg-muted'"
          aria-label="Send to…"
          @click="showSend = true"
        >
          <IconSend class="size-5" />
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
        :src="item.image_url"
        :alt="item.name"
        format="portrait"
        :focal-point="item.image_focal_point"
        :render-width="600"
        placeholder="/assets/placeholders/item.webp"
        class="absolute inset-0"
      />
      <!-- Gradient fading into the page background -->
      <div class="hero-fade pointer-events-none absolute inset-x-0 bottom-0 h-2/3" />

      <!-- Overlaid identity -->
      <div class="absolute inset-x-0 bottom-0 flex flex-col gap-1.5 px-4 pb-3">
        <div class="flex flex-wrap items-center gap-1.5">
          <span
            class="rounded px-2 py-0.5 font-cinzel text-2xs font-bold uppercase tracking-wider text-white"
            :style="{ backgroundColor: rarityColor + 'EE' }"
          >
            {{ ITEM_RARITY_LABELS[item.rarity] }}
          </span>
          <span
            v-if="item.requires_attunement"
            class="flex items-center gap-1 rounded bg-black/55 px-1.5 py-0.5 font-cinzel text-2xs font-bold uppercase tracking-wider text-primary"
          >
            ✦ Attunement
          </span>
          <span
            v-if="item.source"
            class="rounded bg-black/55 px-2 py-0.5 font-cinzel text-2xs font-bold uppercase tracking-wider text-white"
          >
            {{ itemSourceLabel(item.source, item.source_title) }}
          </span>
        </div>

        <h2 class="font-cinzel text-3xl font-bold leading-tight text-white drop-shadow-sm">
          {{ item.name }}
        </h2>

        <p v-if="subtitle" class="font-fell text-sm italic text-white/85 drop-shadow-sm">
          {{ subtitle }}
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
        <MobileQuickFact label="Type" :value="typeLabel" class="bg-card" />
        <MobileQuickFact label="Rarity" :value="ITEM_RARITY_LABELS[item.rarity]" class="bg-card" />
        <MobileQuickFact label="Value" :value="item.cost" class="bg-card" />
        <MobileQuickFact label="Weight" :value="weightLabel" class="bg-card" />
      </div>

      <!-- 4. Tags -->
      <div v-if="item.tags?.length" class="flex flex-wrap gap-1.5">
        <span
          v-for="tag in item.tags"
          :key="tag"
          class="rounded-full bg-muted px-2.5 py-1 font-cinzel text-2xs tracking-wider text-muted-foreground"
        >
          {{ tag }}
        </span>
      </div>

      <!-- 5. Accordion sections -->
      <MobileAccordionSection v-model:open="openSections.description" title="Description">
        <div class="flex flex-col gap-4">
          <div v-if="item.is_arcane_focus" class="font-fell text-sm italic text-muted-foreground">
            Can be used as an arcane focus
          </div>
          <div v-if="item.requires_attunement" class="font-fell text-sm italic text-primary">
            Requires attunement<span v-if="item.attunement_requirements"> — {{ item.attunement_requirements }}</span>
          </div>
          <RichTextViewer v-if="item.description" :content="item.description" />
          <p
            v-else-if="!item.is_arcane_focus && !item.requires_attunement"
            class="font-fell text-sm italic text-muted-foreground"
          >
            No description recorded for this item.
          </p>
        </div>
      </MobileAccordionSection>

      <!-- Properties: weapon / armor / charges -->
      <MobileAccordionSection
        v-if="hasProperties"
        v-model:open="openSections.properties"
        title="Properties"
      >
        <div class="flex flex-col gap-4">
          <div v-if="item.damage_rolls?.length || item.weapon_range" class="flex flex-col gap-1">
            <h3 class="font-cinzel text-xs font-bold uppercase tracking-wider text-primary">Weapon</h3>
            <p v-if="item.damage_rolls?.length" class="font-fell text-sm text-foreground">
              {{ item.damage_rolls.map((r) => `${r.dice} ${r.type}`).join(" + ")
              }}<span v-if="item.versatile_damage" class="text-muted-foreground">
                ({{ item.versatile_damage }} two-handed)</span>
            </p>
            <p v-if="item.weapon_range" class="font-fell text-sm text-muted-foreground">
              Range: {{ item.weapon_range }}
            </p>
            <p v-if="item.properties?.length" class="font-fell text-sm capitalize text-muted-foreground">
              {{ item.properties.join(", ") }}
            </p>
          </div>

          <div v-if="item.armor_class" class="flex flex-col gap-1">
            <h3 class="font-cinzel text-xs font-bold uppercase tracking-wider text-primary">Armor Class</h3>
            <p class="font-fell text-sm text-foreground">{{ item.armor_class }}</p>
          </div>

          <div v-if="item.charges" class="flex flex-col gap-1">
            <h3 class="font-cinzel text-xs font-bold uppercase tracking-wider text-primary">
              {{ item.item_type === "ammunition" ? "Quantity" : "Charges" }}
            </h3>
            <p class="font-fell text-sm text-foreground">
              {{ item.charges }}<span v-if="item.item_type !== 'ammunition'"> charges</span><span v-if="item.recharge"> · {{ item.recharge }}</span>
            </p>
          </div>
        </div>
      </MobileAccordionSection>

      <!-- Mundane description (pre-identification) -->
      <MobileAccordionSection
        v-if="item.mundane_description"
        v-model:open="openSections.mundane"
        title="Mundane Description"
      >
        <RichTextViewer :content="item.mundane_description" />
      </MobileAccordionSection>

      <!-- Curse (DM-only context; mobile detail is the DM view) -->
      <MobileAccordionSection
        v-if="item.curse_description"
        v-model:open="openSections.curse"
        title="Curse"
      >
        <RichTextViewer :content="item.curse_description" />
      </MobileAccordionSection>

      <!-- DM notes (never shown to players) -->
      <MobileAccordionSection
        v-if="item.dm_notes"
        v-model:open="openSections.dmNotes"
        title="DM Notes"
      >
        <RichTextViewer :content="item.dm_notes" />
      </MobileAccordionSection>
    </div>

    <!-- ── 6. Fixed bottom action bar ─────────────────────────────────────── -->
    <div
      class="fixed inset-x-0 bottom-0 z-30 flex items-center gap-2 border-t border-border bg-background/95 px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur-md"
    >
      <button
        type="button"
        class="flex shrink-0 items-center gap-1.5 rounded-lg border border-border px-3 py-3 font-cinzel text-sm font-bold tracking-wider text-foreground transition-colors active:bg-muted"
        @click="showSend = true"
      >
        <IconSend class="size-4" />
        Send
      </button>

      <RouterLink
        :to="`/vault/${item.id}?edit=true`"
        class="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary px-4 py-3 font-cinzel text-sm font-bold tracking-wider text-primary-foreground active:opacity-90"
      >
        <IconEdit class="size-4" />
        Edit
      </RouterLink>
    </div>
  </div>

  <!-- ── 7. Send bottom sheet (distribution) ──────────────────────────────── -->
  <ItemSendSheet v-model:open="showSend" :item="item" />

  <!-- Overflow ⋮ sheet — Clone / Send to Scriptorium live in the edit form
       (they require the form to be mounted), so these route into it. -->
  <MobileSheet v-model:open="showMenu" :title="item.name">
    <div class="flex flex-col gap-1 pb-2">
      <RouterLink
        :to="`/vault/${item.id}?edit=true`"
        class="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left font-fell text-sm text-foreground active:bg-muted/50"
        @click="showMenu = false"
      >
        <IconCopy class="size-4 shrink-0" /> Clone
      </RouterLink>
      <RouterLink
        :to="`/vault/${item.id}?edit=true`"
        class="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left font-fell text-sm text-foreground active:bg-muted/50"
        @click="showMenu = false"
      >
        <IconScrollText class="size-4 shrink-0" /> Send to Scriptorium
      </RouterLink>
      <button
        type="button"
        class="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left font-fell text-sm text-destructive active:bg-destructive/10"
        @click="onDelete"
      >
        <IconDelete class="size-4 shrink-0" /> Delete item
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
import ItemSendSheet from "@/components/items/ItemSendSheet.vue";
import { IconCopy, IconDelete, IconEdit, IconScrollText, IconSend } from "@/lib/icons";
import { useDeleteItem } from "@/composables/useItems";
import {
  ITEM_RARITY_LABELS,
  ITEM_TYPE_LABELS,
  RARITY_BADGE_COLORS,
  itemSourceLabel,
} from "@/types/item.types";
import type { Item } from "@/types/item.types";

const { item } = defineProps<{ item: Item }>();

const router = useRouter();

// ── Scroll-driven app bar ──────────────────────────────────────────────────────
const scrollRoot = ref<HTMLElement | null>(null);
const { y: scrollY } = useScroll(scrollRoot);
const scrolled = computed(() => scrollY.value > 150);

// ── Display helpers (mirror the desktop sheet) ──────────────────────────────────
const typeLabel = computed(() => ITEM_TYPE_LABELS[item.item_type] ?? item.item_type);
const weightLabel = computed(() => (item.weight !== null ? String(item.weight) : null));
const subtitle = computed(() =>
  [typeLabel.value, ITEM_RARITY_LABELS[item.rarity]].filter(Boolean).join(" · "),
);
const rarityColor = computed(() => RARITY_BADGE_COLORS[item.rarity] ?? "#9ca3af");

const hasAnyQuickFact = computed(
  () => !!(typeLabel.value || item.rarity || item.cost || weightLabel.value),
);
const hasProperties = computed(
  () =>
    !!(item.damage_rolls?.length || item.weapon_range || item.armor_class || item.charges),
);

// ── Accordion state (Description open by default) ────────────────────────────────
const openSections = reactive({
  description: true,
  properties: false,
  mundane: false,
  curse: false,
  dmNotes: false,
});

// ── Sheets ───────────────────────────────────────────────────────────────────
const showSend = ref(false);
const showMenu = ref(false);

// ── Delete ───────────────────────────────────────────────────────────────────
const { mutateAsync: deleteItem } = useDeleteItem();
async function onDelete() {
  if (!confirm(`Delete "${item.name}"? This cannot be undone.`)) return;
  await deleteItem(item);
  // Post-mutation navigation: list view is the success feedback.
  void router.push("/vault");
}

function goBack() {
  if (window.history.length > 1) router.back();
  else void router.push("/vault");
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
