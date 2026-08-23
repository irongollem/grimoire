<!--
  Documentation lives in <script setup>, not here (same reason as AppButton):
  any comment at the template root becomes a sibling of the `template v-if` /
  `div v-else` pair below, which is one more root node than this component
  actually has and would leak an HTML comment into the "not customizing" output
  that the story requires to be byte-identical to the slot alone.
-->
<template>
  <template v-if="!customizing">
    <slot />
  </template>
  <div v-else :class="['relative', $attrs.class]">
    <div ref="slotHost" v-show="!slotIsEmpty"><slot /></div>

    <div
      v-if="slotIsEmpty"
      class="flex min-h-24 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border/70 bg-muted/10 px-4 py-6 text-center"
    >
      <p class="font-cinzel text-sm font-semibold text-muted-foreground">{{ widget.title }}</p>
      <p class="text-caption text-muted-foreground/80 italic">{{ widget.description }}</p>
      <p v-if="widget.selfHiding" class="text-caption text-muted-foreground/60 italic">
        Empty right now — it appears on its own once it has something to show.
      </p>
    </div>

    <div
      class="absolute bottom-full right-0 z-10 mb-1 flex items-center gap-0.5 rounded-md border border-border bg-card/95 px-1 py-0.5 shadow-sm"
    >
      <AppButton
        variant="ghost"
        size="icon-xs"
        :icon="IconDrag"
        :class="['dashboard-customize-grip cursor-grab active:cursor-grabbing', ICON_TOUCH_TARGET]"
        aria-label="Drag to reorder"
        tooltip="Drag to reorder — arrow keys also move this widget"
        @keydown="onGripKeydown"
      />
      <AppButton
        v-if="widget.widths.length > 1"
        variant="ghost"
        size="xs"
        :icon="IconMoveH"
        :label="widthLabel"
        :aria-label="`Change width — currently ${widthLabel}`"
        tooltip="Cycle this widget's width"
        @click="emit('cycle-width', entry.key)"
      />
      <!-- Only for widgets that carry per-instance settings (#764). Sits
           before Remove so the destructive control stays last in the pill. -->
      <AppButton
        v-if="widget.configurable"
        variant="ghost"
        size="icon-xs"
        :icon="IconSettings"
        :aria-label="`Configure ${widget.title}`"
        tooltip="Choose what this card shows"
        @click="emit('configure', entry.key)"
      />
      <AppButton
        variant="ghost"
        size="icon-xs"
        :icon="IconClose"
        aria-label="Remove from dashboard"
        tooltip="Move to the shelf — nothing is deleted"
        @click="emit('remove', entry.key)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * The per-widget overlay Customize mode (#763) puts around every widget on the
 * dashboard. It owns no layout arithmetic at all — `move`, `cycle-width`,
 * `remove` and `configure` are emitted as intent, and `src/lib/dashboard/arrangeOps.ts`
 * (already finished, already tested) is what turns them into a new layout.
 * That split is what lets the pointer-drag path (owned by the drag
 * container, a separate story) and this keyboard path agree on every edit:
 * neither one computes a position, they both just say what happened.
 *
 * The widget itself is rendered untouched — no border, no strip, no reskin.
 * Customize mode adds controls and nothing else, because judging a layout means
 * seeing the board you actually have; a frame drawn around every card makes
 * customizing look like a different page from the one being arranged.
 * The pill is anchored by its own bottom edge (`bottom-full`) rather than by a
 * fixed offset, because it is not a fixed height: `ICON_TOUCH_TARGET` grows the
 * grip to 44px below `md`, so a hard `-top-7` put it 16px *inside* the card on
 * a phone and covered the very header links this placement exists to protect.
 *
 * controls float in the row gap *above* each widget rather than over it: an
 * overlay on the card covered real content (`DashboardWidget` puts its own
 * "View all →" link top-right, and `DashboardStats` is a bare row of links),
 * and the view opens the grid's row gap while customizing to make room.
 *
 * `$attrs.class` is forwarded onto the customizing root by hand, because
 * `inheritAttrs` is off below. Without it the view's WIDTH_CLASSES never reach
 * the grid item while customizing: every widget rendered one column wide
 * whatever its real width, and the width control announced a change that
 * nothing on screen made. A full-width Party widget looking identical to a
 * single cell is what makes that misleading rather than merely wrong.
 *
 * Two widgets (DashboardStats, LiveEncounterBanner) render with no card
 * shell at all, which is exactly why this is a wrapping overlay rather than
 * something `DashboardWidget` grows — it has to work identically whether the
 * thing underneath is a bordered card or a bare strip of links.
 */
import { computed, onMounted, onUpdated, ref, useTemplateRef } from "vue";
import AppButton from "@/components/common/AppButton.vue";
import { ICON_TOUCH_TARGET } from "@/components/common/appButtonVariants";
import { IconClose, IconDrag, IconMoveH, IconSettings } from "@/lib/icons";
import type { DashboardLayoutEntry } from "@/lib/dashboard/defaultLayouts";
import type { DashboardWidgetDef } from "@/lib/dashboard/widgetCatalog";

const { entry, widget, customizing = false } = defineProps<{
  /** The layout row this frame wraps — carries the instance `key` every emit reports. */
  entry: DashboardLayoutEntry;
  /** The catalogue definition for `entry.id` — titles the placeholder, gates the width control. */
  widget: DashboardWidgetDef;
  /** Whether Customize mode is active. False renders only the slot — see the template. */
  customizing?: boolean;
}>();

// Never forwarded anywhere: the non-customizing branch has no single root for
// Vue to inherit attrs onto (it is whatever the slot itself renders), so
// leaving inheritance on would make the *customizing* branch's wrapper div the
// only one that ever receives a stray attribute — a difference in behaviour
// between the two states that nothing here should depend on.
defineOptions({ inheritAttrs: false });

const emit = defineEmits<{
  /** One position toward the start (-1) or end (1) of the layout. */
  move: [key: string, direction: -1 | 1];
  /** Advance to the next of `widget.widths`, wrapping. */
  "cycle-width": [key: string];
  /** Off the dashboard and onto the shelf — never a delete. */
  remove: [key: string];
  /** Open this instance's settings dialog. Only ever emitted for a
   *  `configurable` widget, since nothing else renders the control. */
  configure: [key: string];
}>();

const slotHost = useTemplateRef<HTMLElement>("slotHost");
const slotIsEmpty = ref(false);

/**
 * Whether the widget in the slot actually painted anything.
 *
 * Measured from the DOM rather than read off the slot's vnodes, and that
 * distinction is the whole bug this replaced. A self-hiding widget is a
 * *component* — `<PinnedNotesWidget />` — whose own root is `v-if`-ed away.
 * The comment node that leaves behind lives inside that component's render,
 * so from here the slot vnode is a perfectly ordinary component vnode and
 * looks non-empty. Inspecting vnodes only works when the `v-if` sits directly
 * on the slot's root, which is how a test can be written but never how this
 * component is used.
 *
 * `childElementCount` is the honest question: a comment is not an element, so
 * a widget that rendered nothing has none. The text check catches the rarer
 * widget that renders bare text instead of using `v-if`.
 */
function measureSlot(): void {
  const host = slotHost.value;
  if (host === null) return;
  const text = host.textContent;
  slotIsEmpty.value = host.childElementCount === 0 && (text === null || text.trim() === "");
}

// `onUpdated` as well as `onMounted`: a widget's own query resolving is what
// turns an empty PinnedNotesWidget into a populated one, and that lands as a
// re-render long after this frame mounted. Re-measuring is a property read,
// and setting the ref to a value it already holds does not re-trigger.
onMounted(measureSlot);
onUpdated(measureSlot);

const widthLabel = computed(() => entry.width.charAt(0).toUpperCase() + entry.width.slice(1));

function onGripKeydown(event: KeyboardEvent): void {
  switch (event.key) {
    case "ArrowUp":
    case "ArrowLeft":
      event.preventDefault();
      emit("move", entry.key, -1);
      return;
    case "ArrowDown":
    case "ArrowRight":
      event.preventDefault();
      emit("move", entry.key, 1);
      return;
    case "Delete":
    case "Backspace":
      event.preventDefault();
      emit("remove", entry.key);
      return;
    default:
      return;
  }
}
</script>
