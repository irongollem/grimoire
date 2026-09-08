<template>
  <div class="flex items-start gap-2">
    <div>
      <h3 class="font-cinzel text-sm font-bold text-foreground">{{ title }}</h3>
      <p class="text-caption text-muted-foreground">Prepare here, then drop through the existing claimable campaign chat.</p>
    </div>
    <AppButton v-if="heldCount" class="ml-auto" label="Drop all" size="xs" :loading="dispatching === 'all'" @click="dispatch()" />
  </div>

  <ul v-if="loot.length" class="space-y-1.5">
    <li v-for="entry in loot" :key="entry.id" class="flex min-w-0 flex-wrap items-center gap-2 rounded-md border border-border p-2 text-caption">
      <span class="rounded bg-muted px-1.5 py-0.5 uppercase text-muted-foreground">{{ entry.kind.replace('_', ' ') }}</span>
      <span class="min-w-0 flex-1 truncate text-foreground">{{ entry.quantity > 1 ? `${entry.quantity}× ` : '' }}{{ entry.label }}</span>
      <div class="text-right">
        <p :class="statusClass(entry.delivery_state)">{{ statusLabel(entry.delivery_state) }}</p>
        <p v-if="entry.delivery_state !== 'held'" class="text-2xs text-muted-foreground">
          <template v-if="entry.quantity_remaining > 0">{{ entry.quantity_remaining }} remaining</template>
          <template v-if="entry.claimed_by_names.length"> · {{ entry.claimed_by_names.join(', ') }}</template>
          <template v-if="entry.handed_out_this_session"> · this session</template>
        </p>
      </div>
      <AppButton v-if="entry.delivery_state === 'held'" label="Drop" size="xs" :loading="dispatching === entry.id" @click="dispatch(entry.id)" />
      <AppButton v-if="entry.delivery_state === 'held'" label="Remove" size="xs" variant="subtle" :loading="removingId === entry.id" @click="remove(entry.id)" />
      <AppButton v-else-if="entry.dispatch_message_id && entry.delivery_state !== 'message_removed'" label="Open chat card" size="xs" variant="subtle" @click="ui.openChatAt(entry.dispatch_message_id)" />
    </li>
  </ul>
  <p v-else class="text-caption italic text-muted-foreground">{{ emptyLabel }}</p>
  <p v-if="loot.some((entry) => entry.delivery_state !== 'held')" class="text-2xs text-muted-foreground">Claims are authoritative in chat and inventory. Reassignment is not available in Run mode.</p>
  <p v-if="error" role="alert" class="text-caption text-destructive">{{ error }}</p>
</template>

<script setup lang="ts">
/**
 * The half of a loot surface that is genuinely home-agnostic: the entries
 * list, drop/remove actions, and claim status. Extracted from
 * the beat's loot panel (now `QuestPayoffPanel`) when rooms gained the same "hold, then drop" verb
 * (#830) — every action here authorises off `entry.campaign_id`, a field
 * every home (beat or room) carries, so a beat panel and a room panel share
 * this byte-for-byte instead of diverging.
 *
 * What stays per-surface is the "prepare a new entry" form: a room can roll
 * a loot-table chest into existence and a beat cannot, which is a difference
 * in kind, not in a few prop values — see `QuestPayoffPanel` and
 * `LocationLootPanel`.
 *
 * Emits `dropped` after a successful dispatch so a location-homed caller can
 * invalidate the room's `location_state` cache. `dispatch_loot` records the
 * room's `looted` fact as part of the same drop, but that write doesn't
 * touch this table's query cache, and this component has no business
 * knowing what a room is — so it just announces the event and lets the
 * caller decide what else went stale.
 */
import { computed, ref } from "vue";
import { useDeleteLootPlacement, useDispatchLoot } from "@/composables/quests/useQuestFlow";
import { useUiStore } from "@/stores/ui";
import type { LootPlacement, LootPlacementDeliveryState } from "@/types/quest.types";
import AppButton from "@/components/common/AppButton.vue";

const { title, emptyLabel, loot } = defineProps<{
  title: string;
  emptyLabel: string;
  loot: LootPlacement[];
}>();
const emit = defineEmits<{ dropped: [] }>();

const ui = useUiStore();
const deleteLoot = useDeleteLootPlacement();
const dispatchLoot = useDispatchLoot();

const removingId = ref("");
const dispatching = ref("");
const error = ref("");

const heldIds = computed(() => loot.filter((entry) => entry.delivery_state === "held").map((entry) => entry.id));
const heldCount = computed(() => heldIds.value.length);

function statusLabel(status: LootPlacementDeliveryState) {
  return { held: "Held", chat: "In chat", partially_claimed: "Partly claimed", claimed: "Claimed", message_removed: "Chat removed" }[status];
}
function statusClass(status: LootPlacementDeliveryState) {
  return status === "claimed" ? "text-tone-success" : status === "message_removed" ? "text-tone-caution" : "text-muted-foreground";
}

async function remove(id: string) {
  const entry = loot.find((e) => e.id === id);
  if (!entry) return;
  removingId.value = id; error.value = "";
  try { await deleteLoot.mutateAsync({ id, campaignId: entry.campaign_id }); }
  catch (caught) { error.value = caught instanceof Error ? caught.message : "Could not remove loot"; }
  finally { removingId.value = ""; }
}

async function dispatch(entryId?: string) {
  const entryIds = entryId ? [entryId] : heldIds.value;
  if (!entryIds.length) return;
  const campaignId = loot.find((entry) => entryIds.includes(entry.id))?.campaign_id;
  if (!campaignId) return;
  dispatching.value = entryId ?? "all"; error.value = "";
  try {
    await dispatchLoot.mutateAsync({ entryIds, campaignId });
    emit("dropped");
  }
  catch (caught) { error.value = caught instanceof Error ? caught.message : "Could not drop loot in chat"; }
  finally { dispatching.value = ""; }
}
</script>
