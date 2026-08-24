import type { Component } from "vue";
import type { DashboardWidgetId } from "@/lib/dashboard/widgetCatalog";
import LiveEncounterBanner from "@/components/dashboard/widgets/LiveEncounterBanner.vue";
import PartyWidget from "@/components/dashboard/widgets/PartyWidget.vue";
import QuestsWidget from "@/components/dashboard/widgets/QuestsWidget.vue";
import SessionWidget from "@/components/dashboard/widgets/SessionWidget.vue";
import UnidentifiedWidget from "@/components/dashboard/widgets/UnidentifiedWidget.vue";
import RecentNpcsWidget from "@/components/dashboard/widgets/RecentNpcsWidget.vue";
import PinnedNotesWidget from "@/components/dashboard/widgets/PinnedNotesWidget.vue";
import PrepGapsWidget from "@/components/dashboard/widgets/PrepGapsWidget.vue";
import NextSessionWidget from "@/components/dashboard/widgets/NextSessionWidget.vue";
import DashboardStats from "@/components/dashboard/widgets/DashboardStats.vue";
import DmScreenCardWidget from "@/components/dashboard/widgets/DmScreenCardWidget.vue";
import DmScreenCardSettings from "@/components/dashboard/settings/DmScreenCardSettings.vue";
import RollTableWidget from "@/components/dashboard/widgets/RollTableWidget.vue";
import RollTableCardSettings from "@/components/dashboard/settings/RollTableCardSettings.vue";
import ConditionsWidget from "@/components/dashboard/widgets/ConditionsWidget.vue";
import LatestSessionNoteWidget from "@/components/dashboard/widgets/LatestSessionNoteWidget.vue";
import QuickDiceWidget from "@/components/dashboard/widgets/QuickDiceWidget.vue";
import DeathSavesWidget from "@/components/dashboard/widgets/DeathSavesWidget.vue";
import TableVitalsWidget from "@/components/dashboard/widgets/TableVitalsWidget.vue";
import DowntimeQueueWidget from "@/components/dashboard/widgets/DowntimeQueueWidget.vue";
import QuestLootWidget from "@/components/dashboard/widgets/QuestLootWidget.vue";
import UpcomingEventsWidget from "@/components/dashboard/widgets/UpcomingEventsWidget.vue";
import JumpToWidget from "@/components/dashboard/widgets/JumpToWidget.vue";
import QuickCreateWidget from "@/components/dashboard/widgets/QuickCreateWidget.vue";

/**
 * Maps every `DashboardWidgetId` to its component. Kept apart from
 * `lib/dashboard/widgetCatalog.ts` so the catalogue's metadata stays
 * unit-testable without pulling Vue components into it. The `Record` type
 * makes completeness a compile-time guarantee: forgetting a widget id here
 * is a type error, not a runtime hole in the dashboard.
 */
export const WIDGET_COMPONENTS: Record<DashboardWidgetId, Component> = {
  party: PartyWidget,
  quests: QuestsWidget,
  session: SessionWidget,
  unidentified: UnidentifiedWidget,
  "prep-gaps": PrepGapsWidget,
  "next-session": NextSessionWidget,
  "recent-npcs": RecentNpcsWidget,
  "pinned-notes": PinnedNotesWidget,
  "live-encounter": LiveEncounterBanner,
  stats: DashboardStats,
  "dm-screen-card": DmScreenCardWidget,
  "roll-table": RollTableWidget,
  conditions: ConditionsWidget,
  "latest-session-note": LatestSessionNoteWidget,
  "quick-dice": QuickDiceWidget,
  "death-saves": DeathSavesWidget,
  "table-vitals": TableVitalsWidget,
  "downtime-queue": DowntimeQueueWidget,
  "quest-loot": QuestLootWidget,
  "upcoming-events": UpcomingEventsWidget,
  "jump-to": JumpToWidget,
  "quick-create": QuickCreateWidget,
};

/**
 * The settings editor for each widget that declares `configurable: true`
 * (#764), mounted by `DashboardWidgetSettingsModal` for one layout entry.
 *
 * `Partial` rather than `Record`, because most widgets have nothing to
 * configure — so completeness cannot be a type error here the way it is above.
 * `widgetComponents.test.ts` enforces it instead, in both directions: a
 * configurable widget with no editor opens an empty dialog, and an editor for a
 * widget that is not configurable is a control the DM can never reach.
 *
 * Each editor takes `modelValue` (the entry's stored blob, possibly absent) and
 * emits `update:modelValue` with the complete replacement — never a patch. See
 * `configureEntry` in `lib/dashboard/arrangeOps.ts` for why whole-blob.
 */
export const WIDGET_SETTINGS_COMPONENTS: Partial<Record<DashboardWidgetId, Component>> = {
  "dm-screen-card": DmScreenCardSettings,
  "roll-table": RollTableCardSettings,
};
