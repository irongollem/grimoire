<template>
  <section class="space-y-3 rounded-lg border border-border bg-card p-3" aria-label="Beat loot">
    <div class="flex items-start gap-2">
      <div>
        <h3 class="font-cinzel text-sm font-bold text-foreground">Beat loot</h3>
        <p class="text-caption text-muted-foreground">Prepare here, then drop through the existing claimable campaign chat.</p>
      </div>
      <AppButton v-if="heldCount" class="ml-auto" label="Drop all" size="xs" :loading="dispatching === 'all'" @click="dispatch()" />
    </div>

    <ul v-if="loot.length" class="space-y-1.5">
      <li v-for="entry in loot" :key="entry.id" class="flex items-center gap-2 rounded-md border border-border p-2 text-caption">
        <span class="rounded bg-muted px-1.5 py-0.5 uppercase text-muted-foreground">{{ entry.kind.replace('_', ' ') }}</span>
        <span class="min-w-0 flex-1 truncate text-foreground">{{ entry.quantity > 1 ? `${entry.quantity}× ` : '' }}{{ entry.label }}</span>
        <span :class="statusClass(entry.delivery_state)">{{ statusLabel(entry.delivery_state) }}</span>
        <AppButton v-if="entry.delivery_state === 'held'" label="Drop" size="xs" :loading="dispatching === entry.id" @click="dispatch(entry.id)" />
        <AppButton v-if="entry.delivery_state === 'held'" label="Remove" size="xs" variant="subtle" :loading="removingId === entry.id" @click="remove(entry.id)" />
      </li>
    </ul>
    <p v-else class="text-caption italic text-muted-foreground">No loot prepared for this beat.</p>

    <div class="grid gap-2 sm:grid-cols-[8rem_1fr_auto]">
      <AppSelect v-model="kind" aria-label="Loot kind">
        <option value="item">Item</option>
        <option value="currency">Currency</option>
      </AppSelect>
      <EntityCombobox v-if="kind === 'item'" v-model="itemId" :options="itemOptions" placeholder="Find an Item Vault item…" />
      <AppInput v-else v-model="label" placeholder="Currency label (optional)" />
      <AppButton label="Prepare" size="sm" :disabled="!canAdd" :loading="adding" @click="add" />
    </div>
    <div v-if="kind === 'item'" class="grid grid-cols-2 gap-2 sm:grid-cols-[7rem_1fr]">
      <label class="text-caption text-muted-foreground">Quantity <AppInput v-model.number="quantity" type="number" min="1" /></label>
      <label class="text-caption text-muted-foreground">Table label <AppInput v-model="label" placeholder="Optional label" /></label>
    </div>
    <div v-else class="grid grid-cols-5 gap-2">
      <label v-for="coin in coins" :key="coin" class="text-caption uppercase text-muted-foreground">{{ coin }}<AppInput v-model.number="currency[coin]" type="number" min="0" /></label>
    </div>
    <p v-if="error" role="alert" class="text-caption text-destructive">{{ error }}</p>
  </section>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";
import { useCreateQuestBeatLoot, useDeleteQuestBeatLoot, useDispatchQuestBeatLoot } from "@/composables/useQuestFlow";
import { useItems } from "@/composables/useItems";
import { useAuthStore } from "@/stores/auth";
import type { QuestBeat, QuestBeatLoot, QuestBeatLootDeliveryState, QuestBeatLootKind } from "@/types/quest.types";
import AppButton from "@/components/common/AppButton.vue";
import AppInput from "@/components/common/AppInput.vue";
import AppSelect from "@/components/common/AppSelect.vue";
import EntityCombobox from "@/components/common/EntityCombobox.vue";

const props = defineProps<{ beat: QuestBeat; loot: QuestBeatLoot[] }>();
const auth = useAuthStore();
const { data: items } = useItems();
const createLoot = useCreateQuestBeatLoot();
const deleteLoot = useDeleteQuestBeatLoot();
const dispatchLoot = useDispatchQuestBeatLoot();
const kind = ref<Extract<QuestBeatLootKind, "item" | "currency">>("item");
const itemId = ref("");
const label = ref("");
const quantity = ref(1);
const coins = ["pp", "gp", "ep", "sp", "cp"] as const;
const currency = reactive<Record<(typeof coins)[number], number>>({ pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 });
const adding = ref(false);
const removingId = ref("");
const dispatching = ref("");
const error = ref("");
const heldCount = computed(() => props.loot.filter((entry) => entry.delivery_state === "held").length);
const itemOptions = computed(() => (items.value ?? [])
  .filter((item) => item.user_id === auth.user?.id || item.campaign_id === props.beat.campaign_id)
  .map((item) => ({ id: item.id, name: item.name })));
const canAdd = computed(() => kind.value === "item" ? !!itemId.value && quantity.value > 0 : coins.some((coin) => currency[coin] > 0));

watch(kind, () => { itemId.value = ""; label.value = ""; error.value = ""; });

function statusLabel(status: QuestBeatLootDeliveryState) {
  return { held: "Held", chat: "In chat", partially_claimed: "Partly claimed", claimed: "Claimed", message_removed: "Chat removed" }[status];
}
function statusClass(status: QuestBeatLootDeliveryState) {
  return status === "claimed" ? "text-tone-success" : status === "message_removed" ? "text-tone-caution" : "text-muted-foreground";
}

async function add() {
  if (!canAdd.value) return;
  adding.value = true;
  error.value = "";
  try {
    await createLoot.mutateAsync({
      beat_id: props.beat.id,
      quest_id: props.beat.quest_id,
      campaign_id: props.beat.campaign_id,
      kind: kind.value,
      item_id: kind.value === "item" ? itemId.value : null,
      quantity: kind.value === "item" ? Math.max(1, Math.floor(quantity.value)) : 1,
      label: label.value.trim(),
      payload: kind.value === "currency" ? { ...currency } : {},
      source_type: "prepared",
      source_id: null,
      sort_order: props.loot.length,
    });
    itemId.value = ""; label.value = ""; quantity.value = 1;
    for (const coin of coins) currency[coin] = 0;
  } catch (caught) { error.value = caught instanceof Error ? caught.message : "Could not prepare loot"; }
  finally { adding.value = false; }
}

async function remove(id: string) {
  removingId.value = id; error.value = "";
  try { await deleteLoot.mutateAsync({ id, campaignId: props.beat.campaign_id }); }
  catch (caught) { error.value = caught instanceof Error ? caught.message : "Could not remove loot"; }
  finally { removingId.value = ""; }
}

async function dispatch(entryId?: string) {
  dispatching.value = entryId ?? "all"; error.value = "";
  try { await dispatchLoot.mutateAsync({ beatId: props.beat.id, entryId, campaignId: props.beat.campaign_id }); }
  catch (caught) { error.value = caught instanceof Error ? caught.message : "Could not drop loot in chat"; }
  finally { dispatching.value = ""; }
}
</script>
