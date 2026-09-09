<template>
  <section v-if="canShow" class="rounded-lg border border-border bg-card overflow-hidden">
    <div class="px-3 py-2 border-b border-border bg-muted/20 flex items-center gap-2">
      <span class="text-label-lg font-semibold text-muted-foreground">Map</span>
      <span class="ml-auto rounded-full bg-muted px-2 py-0.5 text-label font-semibold text-muted-foreground">
        {{ roomCountLabel }} · {{ wayCountLabel }}
      </span>
    </div>
    <div class="p-3 flex flex-col gap-3">
      <PlayerSitePlan v-if="planValue" :plan="planValue" />
      <ul class="flex flex-col gap-1">
        <li
          v-for="room in rooms"
          :key="room.spaceLocationId"
          class="flex items-center gap-2 px-1 py-1"
        >
          <span class="min-w-0 flex-1 truncate text-body text-foreground">{{ room.name }}</span>
          <IconShieldCheck
            v-if="room.isCleared"
            class="h-3.5 w-3.5 shrink-0 text-tone-success"
            aria-label="Cleared"
            title="Cleared"
          />
          <IconLoot
            v-if="room.isLooted"
            class="h-3.5 w-3.5 shrink-0 text-tone-caution"
            aria-label="Looted"
            title="Looted"
          />
        </li>
      </ul>
      <p class="text-caption text-muted-foreground italic">Only what the party has walked is drawn.</p>
    </div>
  </section>
</template>

<script setup lang="ts">
/**
 * The player's own record of a site: a plan composed entirely from what the
 * party has explored or glimpsed (#868 story S9, frame 16 of `atlas/Sites &
 * Cartographer.html`). Renders nothing when the site has no shared map, or
 * nothing has been explored yet — a heading over an empty box would
 * announce "there is more here" before the party found it, exactly the
 * spoiler `get_player_visible_site_state` was written to avoid.
 *
 * No image, no calibration, no pan/zoom frame: the RPC now returns cell
 * geometry directly (`usePlayerVisibleSiteState`'s `PlayerSitePlan`), so
 * there is nothing left to anchor an `<img>`-based overlay to, and drawing
 * one at all would be the "one honest limit" frame 16 exists to close — a
 * signed image URL that still contained every room and door regardless of
 * what the party had found. `PlayerSitePlan.vue` renders the SVG; this
 * component stays the card shell plus the room list, which is the
 * accessible textual record of the same facts (#828: the list renders even
 * when nothing draws, so it stays a sibling of the plan rather than
 * content nested inside it).
 */
import { computed } from "vue";
import PlayerSitePlan from "@/components/player/PlayerSitePlan.vue";
import { usePlayerVisibleLocation } from "@/composables/locations/useLocations";
import { exploredRooms, usePlayerVisibleSiteState, wayCount } from "@/composables/locations/usePlayerVisibleSiteState";
import { IconLoot, IconShieldCheck } from "@/lib/icons";

const { siteLocationId } = defineProps<{ siteLocationId: string }>();
const siteIdRef = computed(() => siteLocationId);

const { data: site } = usePlayerVisibleLocation(siteIdRef);
const { data: plan } = usePlayerVisibleSiteState(siteIdRef);

// Explicit `.value` throughout (rather than relying on the template's
// implicit ref auto-unwrap) — `plan` is a real `Ref` from TanStack Query in
// production, but that auto-unwrap only fires for an actual `isRef()`
// value, which a hand-built test double need not be.
const planValue = computed(() => plan.value);
const rooms = computed(() => (plan.value ? exploredRooms(plan.value) : []));
const canShow = computed(() => !!site.value?.is_map_shared && rooms.value.length > 0);

const roomCountLabel = computed(() => {
  const n = rooms.value.length;
  return `${n} ${n === 1 ? "room" : "rooms"} walked`;
});
const wayCountLabel = computed(() => {
  const n = plan.value ? wayCount(plan.value) : 0;
  return `${n} ${n === 1 ? "way" : "ways"} on`;
});
</script>
