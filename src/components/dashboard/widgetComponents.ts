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
};
