<template>
  <!--
    Sized to sit in `PageHeader`'s `#actions` row beside the surface toggle,
    not as a band of its own above the grid. A row above the grid pushed the
    board down on entering Customize mode, which is the one thing a layout editor
    must not do: you cannot judge an arrangement that moves when you start
    customizing it.
  -->
  <div class="flex min-w-0 items-center gap-2">
    <div class="w-44 min-w-0 sm:w-56">
      <!--
        `lg`, unlike every other combobox in the app: those pick a thing you
        can already name, this one is *browsed*. Twenty-odd options at three
        lines each show two at a time in the default 13rem box, which is the
        real reason the catalogue feels undiscoverable — nothing is truncated
        (the cap is 50 and there are 35 widgets at most).
      -->
      <EntityCombobox
        v-model="picked"
        dropdown-height="lg"
        :options="options"
        :placeholder="options.length === 0 ? 'Every widget is on your dashboard' : 'Add a widget…'"
      >
        <template #option="{ opt }">
          <span class="flex flex-col gap-0.5 py-0.5">
            <span class="flex flex-wrap items-center gap-2">
              <span class="font-semibold">{{ opt.name }}</span>
              <!-- The entire discovery path for a widget the catalogue grew
                   after this DM last saved (#764 and beyond) — see `isNew`. -->
              <AppButton
                v-if="opt.isNew"
                as="span"
                variant="tinted"
                tone="info"
                size="xs"
                label="New"
              />
            </span>
            <span class="text-caption text-muted-foreground">{{ opt.description }}</span>
            <span v-if="opt.selfHiding" class="text-caption italic text-muted-foreground/80">
              {{ opt.selfHidingNote }}
            </span>
          </span>
        </template>
      </EntityCombobox>
    </div>

    <AppButton
      variant="outline"
      size="sm"
      :icon="IconReset"
      label="Reset to default"
      :disabled="isDefault"
      :tooltip="isDefault ? 'Already the default layout' : undefined"
      @click="emit('reset')"
    />
  </div>
</template>

<script setup lang="ts">
/**
 * Adding a widget back, in Customize mode (#763).
 *
 * A picker rather than the drawer the issue described. Two reasons, both of
 * which showed up the moment it was on screen:
 *
 * 1. **A drawer changes the shape of the page.** It pushed the grid down by a
 *    couple of hundred pixels, so customize mode and normal mode did not look
 *    like the same dashboard — which is precisely the thing a layout editor
 *    must not do, since judging a layout means seeing it where it will live.
 * 2. **The catalogue is about to get big.** #764 lists 25-plus candidate
 *    widgets. A list of 25 rows is a wall you scroll; a searchable picker is
 *    the same size at three widgets or at thirty, and it gains typeahead for
 *    free.
 *
 * `EntityCombobox` is the house primitive for exactly this — a dynamic,
 * searchable set — and an add-picker that empties itself on select is a named,
 * sanctioned pattern (see `StoreInventory`'s "Add item to inventory…" box in
 * CLAUDE.md). That is also why `picked` and the combobox's own query are local
 * refs and not `useUiStore` state: the Filter State Pattern governs filters
 * over the list *on the page*, and this filters a popup of candidates.
 *
 * Still purely presentational: it emits `add` and `reset`, and the view owns
 * `useDashboardLayout`, the undo toast and the pre-reset snapshot.
 */
import { computed, ref, watch } from "vue";
import EntityCombobox from "@/components/common/EntityCombobox.vue";
import AppButton from "@/components/common/AppButton.vue";
import { IconReset } from "@/lib/icons";
import { isDefaultLayout, shelfWidgets } from "@/lib/dashboard/arrangeOps";
import type { DashboardLayoutEntry } from "@/lib/dashboard/defaultLayouts";
import type {
  DashboardSurface,
  DashboardWidgetDef,
  DashboardWidgetId,
} from "@/lib/dashboard/widgetCatalog";

interface WidgetOption {
  id: string;
  name: string;
  description: string;
  isNew: boolean;
  selfHiding: boolean;
  selfHidingNote: string;
}

const { entries, surface, newWidgetIds } = defineProps<{
  /** The layout currently on screen — what `shelfWidgets`/`isDefaultLayout` compare against. */
  entries: readonly DashboardLayoutEntry[];
  /** Which dashboard this serves; a widget's eligibility is surface-scoped. */
  surface: DashboardSurface;
  /** Ids the registry gained since this DM last saved (`useDashboardLayout.newWidgetIds`). */
  newWidgetIds: readonly DashboardWidgetId[];
}>();

const emit = defineEmits<{
  /** A widget was picked — the view resolves where it lands via `addWidget`. */
  add: [id: DashboardWidgetId];
  /** "Reset to default" was clicked. No confirm here: the view answers with an undo toast. */
  reset: [];
}>();

// A Set so the "New" lookup is O(1) per option rather than an `includes` scan
// repeated across the whole list on every render.
const newIds = computed(() => new Set(newWidgetIds));

/** Said on the option itself, so a DM knows why adding it may seem to do nothing. */
function selfHidingNote(widget: DashboardWidgetDef): string {
  return `${widget.title} appears on its own once it has something to show.`;
}

const options = computed<WidgetOption[]>(() =>
  shelfWidgets(entries, surface).map((widget) => ({
    id: widget.id,
    name: widget.title,
    description: widget.description,
    isNew: newIds.value.has(widget.id),
    selfHiding: widget.selfHiding === true,
    selfHidingNote: selfHidingNote(widget),
  })),
);

const isDefault = computed(() => isDefaultLayout(entries, surface));

/**
 * Transient by design: picking is the act of adding, so the box empties itself
 * rather than sitting there claiming a selection that no longer exists — the
 * chosen widget is gone from `options` on the next tick anyway.
 */
const picked = ref("");

watch(picked, (id) => {
  if (id === "") return;
  emit("add", id as DashboardWidgetId);
  picked.value = "";
});
</script>
