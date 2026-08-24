<template>
  <!--
    `v-if` rather than `DashboardWidget`'s `empty` slot: a cursed-and-unrevealed
    item is a rare narrative device, not a recurring workflow — unlike
    `UnidentifiedWidget` (loot cycles through unidentified constantly) or the
    downtime queue (a weekly to-do where "nothing waiting" is itself worth
    saying), most campaigns will sit at zero for long stretches, and some
    never trip it at all. A card that is permanently empty is dead weight on
    the shelf, so this follows `DeathSavesWidget` / `TableVitalsWidget`: no
    `loading` prop either, since a spinner that resolves into nothing is a
    card flashing onto the board and off again, which is worse than never
    appearing. `?? []` below is safe for the same reason those two document —
    an unloaded inventory and a loaded inventory with nothing cursed both
    render nothing at all, so collapsing them loses no distinction.
  -->
  <DashboardWidget
    v-if="rows.length > 0"
    title="Cursed items"
    tone="caution"
    :count="rows.length"
    to="/party"
    action-label="Party tracker →"
  >
    <div class="divide-y divide-border">
      <RouterLink
        v-for="row in rows"
        :key="row.invId"
        :to="row.carrierId ? `/play/inventory?memberId=${row.carrierId}` : '/party'"
        class="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/30 transition-colors group"
      >
        <div class="min-w-0 flex-1">
          <p class="truncate font-cinzel text-sm font-semibold text-foreground group-hover:text-primary transition-colors">
            {{ row.itemName }}
          </p>
          <p class="text-caption text-muted-foreground italic">{{ row.carrierName }}</p>
        </div>
        <AppButton
          as="span"
          variant="tinted"
          tone="danger"
          emphasis="soft"
          size="xs"
          class="shrink-0"
          :icon="IconHide"
          label="Hidden"
        />
      </RouterLink>
    </div>
  </DashboardWidget>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { RouterLink } from "vue-router";
import { IconHide } from "@/lib/icons";
import { useParty } from "@/composables/useParty";
import { usePartyInventory } from "@/composables/usePartyInventory";
import { useItems } from "@/composables/useItems";
import { buildCursedItems } from "@/lib/dashboard/cursedItems";
import AppButton from "@/components/common/AppButton.vue";
import DashboardWidget from "../DashboardWidget.vue";

/**
 * Cursed party loot the DM knows about and the players do not (#764).
 *
 * DM-private by construction, not by an extra check here: `usePartyInventory`
 * and `useItems` are the DM's own owner-scoped reads (the same ones
 * `UnidentifiedWidget` and the Vault already use), never the gated
 * `usePlayerVisibleItems`/`get_player_visible_items` projection the player
 * portal reads from. This widget only ever mounts on the DM dashboard
 * (`widgetComponents.ts` → `DashboardView.vue`, both gated to DM mode by the
 * router), so there is no code path where a player's client requests this
 * data. `ItemDetailPanel` — the one place `curse_revealed` is ever toggled —
 * applies its own DM-or-revealed gate on top of that (`canIdentify ||
 * inv?.curse_revealed`), so even the one shared component that renders curse
 * text agrees a hidden curse never reaches a player render.
 *
 * A row links to `/play/inventory?memberId=<id>` for a carried item — the
 * established DM-managing-a-specific-character deep link (see the router
 * guard's `dmManagingMember` in `router/index.ts`, and the same pattern in
 * `useCharacterCreationForm.ts` and `PlayerLevelUpView.vue`) — since that view
 * is the only place the reveal toggle lives. An unassigned or orphaned row has
 * no member to deep-link to, so it falls back to `/party`, where the party
 * stash is visible.
 */
const { data: inventory } = usePartyInventory();
const { data: party } = useParty();
const { data: items } = useItems();

/**
 * `?? []` on all three is the same deliberate fold the template comment
 * above explains: while any of the three queries is still loading this
 * renders the same "nothing to show" as a loaded roster with no hidden
 * curses, and for a self-hiding widget those two cases are indistinguishable
 * on purpose — there is no separate loading/empty state to lose.
 */
const rows = computed(() => buildCursedItems(inventory.value ?? [], party.value ?? [], items.value ?? []));
</script>
