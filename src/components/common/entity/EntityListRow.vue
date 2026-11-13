<template>
  <!--
    The horizontal entity row — a small square emblem, a name, a line of
    supporting text, some tags, and whatever controls belong at the trailing
    edge. The counterpart to `EntityGridCard`, which is the portrait-led shape;
    this is for entities whose picture is an emblem rather than a scene, and
    which read better as a list than as a gallery.

    It exists because `FactionListView` and `PantheonListView` had each written
    the same forty lines: same wrapper classes, same 3rem emblem tile, same
    truncating name, same three tag pills, same chevron. The two had already
    drifted in the small ways that duplication always drifts in — one passed
    `render-width` to `FocalImage` and the other did not, one gave the image an
    empty `alt` and the other gave it none — and neither difference was a
    decision anybody made.

    A `div` with an absolutely-positioned link rather than a `RouterLink`
    wrapper, and this is load-bearing: the trailing slot holds buttons, and a
    button inside an anchor is invalid markup that swallows its own clicks.
    That is also why the slot sits in a `z-10` wrapper with `@click.prevent.stop`
    — it has to win against the link covering the whole row.
  -->
  <!--
    Low art ledger line (#1179, frame 03): a row of the sheet EntityCollection
    draws, 40 px with a dotted rule, the name first and the cells in the list's
    tracks. Below lg the cells fold: the name, any tab, actions and chevron on
    the first line, the rest as an italic line under it.
  -->
  <div
    v-if="ledgerTemplate"
    class="group relative grid min-h-10 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 border-b border-dotted border-border px-4 py-1.5 transition-colors hover:bg-primary/8 lg:grid-cols-(--ledger-cols) lg:py-0"
    :style="{ '--ledger-cols': ledgerTemplate }"
  >
    <RouterLink v-if="!locked" :to="to" class="absolute inset-0 z-2" />
    <div
      v-if="locked"
      class="absolute inset-0 z-20 flex items-center justify-center gap-3 bg-background/80 backdrop-blur-sm"
    >
      <IconLock class="h-4 w-4 text-muted-foreground" />
      <p class="text-label font-semibold text-muted-foreground">Locked</p>
      <RouterLink to="/billing" class="text-label text-primary/80 transition-colors hover:text-primary">
        Upgrade to access
      </RouterLink>
    </div>

    <div class="flex min-w-0 items-center gap-2">
      <span
        class="size-2 shrink-0 rotate-45"
        :class="statusClass ?? 'bg-muted-foreground/40'"
        aria-hidden="true"
      />
      <p class="truncate text-label font-bold text-foreground">{{ title }}</p>
      <template v-for="(cell, i) in cells" :key="`m${i}`">
        <BookmarkTab v-if="isTab(cell)" class="lg:hidden" size="sm" inline v-bind="cell.tab" />
      </template>
    </div>

    <template v-for="(cell, i) in cells" :key="i">
      <span v-if="isTab(cell)" class="hidden lg:flex">
        <BookmarkTab size="sm" inline v-bind="cell.tab" />
      </span>
      <span v-else class="hidden truncate text-label text-muted-foreground lg:block">{{ cell }}</span>
    </template>

    <div class="flex items-center justify-end gap-1">
      <div v-if="$slots.actions" class="relative z-10" @click.prevent.stop>
        <slot name="actions" />
      </div>
      <IconChevronRight
        class="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-colors group-hover:text-primary"
      />
    </div>

    <p v-if="foldedText" class="col-span-full truncate text-2xs italic text-muted-foreground lg:hidden">
      {{ foldedText }}
    </p>
  </div>

  <div
    v-else
    class="group relative flex items-center gap-3 rounded-lg border border-border bg-card p-4 transition-colors hover:border-primary/50"
  >
    <RouterLink v-if="!locked" :to="to" class="absolute inset-0 z-2" />
    <!-- Over quota: the same overlay as the grid card, and no link underneath. -->
    <div
      v-if="locked"
      class="absolute inset-0 z-20 flex items-center justify-center gap-3 rounded-lg bg-background/80 backdrop-blur-sm"
    >
      <IconLock class="h-4 w-4 text-muted-foreground" />
      <p class="text-label font-semibold text-muted-foreground">Locked</p>
      <RouterLink to="/billing" class="text-label text-primary/80 transition-colors hover:text-primary">
        Upgrade to access
      </RouterLink>
    </div>

    <div
      class="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted"
    >
      <!-- Every row picture is a record's (a portrait, an emblem); low art shows the icon instead. -->
      <FocalImage
        v-if="imageUrl && !lowArt"
        :src="imageUrl"
        :alt="title"
        format="square"
        :render-width="200"
        record
      />
      <component v-else :is="fallbackIcon" class="h-5 w-5 text-muted-foreground/40" />
    </div>

    <div class="min-w-0 flex-1">
      <p class="truncate text-heading-xs font-bold text-foreground">{{ title }}</p>
      <p v-if="subtitle" class="text-label text-muted-foreground mt-0.5">{{ subtitle }}</p>
      <TagChips :tags="tags" :max="maxTags" class="mt-1.5" />
      <slot name="body" />
    </div>

    <!--
      One group rather than two row children, so the controls and the chevron
      cost the row a single `gap-3` between them and the text. Split, the extra
      gap comes straight out of the name, which truncates a word earlier for it.
    -->
    <div class="flex shrink-0 items-center gap-1">
      <div v-if="$slots.actions" class="relative z-10" @click.prevent.stop>
        <slot name="actions" />
      </div>
      <IconChevronRight
        class="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-colors group-hover:text-primary"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import TagChips from "@/components/common/TagChips.vue";
import { computed, inject, type Component } from "vue";
import { RouterLink } from "vue-router";
import BookmarkTab from "@/components/common/entity/BookmarkTab.vue";
import { LEDGER_TEMPLATE_KEY, type LedgerCell } from "@/components/common/list/ledger";
import { useLowArt } from "@/composables/useLowArt";
import FocalImage from "@/components/common/media/FocalImage.vue";
import { IconChevronRight, IconLock } from "@/lib/icons";

const {
  imageUrl = null,
  subtitle = null,
  tags = [],
  maxTags = 3,
  locked = false,
  cells = [],
  statusClass = null,
} = defineProps<{
  /** Where the whole row navigates. */
  to: string;
  title: string;
  /** Shown under the title — a faction's type, a pantheon's deity count. */
  subtitle?: string | null;
  /** Emblem. Falls back to `fallbackIcon` when absent. */
  imageUrl?: string | null;
  /** Drawn in the emblem tile when there is no image. */
  fallbackIcon: Component;
  tags?: readonly string[];
  /** Tags beyond this are dropped — the row is a glance, not an inventory. */
  maxTags?: number;
  /** Over quota: greys the row out and removes its link. */
  locked?: boolean;
  /** Low art ledger: one entry per column after the name, in the list's order. */
  cells?: readonly LedgerCell[];
  /** Low art ledger: the status diamond's colour class (alive, dead). */
  statusClass?: string | null;
}>();

const { lowArt } = useLowArt();
// Set by EntityCollection only when low art is on and the list named columns.
const injected = inject(LEDGER_TEMPLATE_KEY, null);
const ledgerTemplate = computed(() => (lowArt.value && injected ? injected.value : null));

type TabCell = Extract<LedgerCell, { tab: unknown }>;
function isTab(cell: LedgerCell): cell is TabCell {
  return cell !== null && typeof cell === "object";
}

// The phone fold: text cells joined under the name; tabs travel beside it.
const foldedText = computed(() =>
  cells
    .filter((c): c is string => typeof c === "string" && c !== "")
    .join(" \u00b7 "),
);
</script>
