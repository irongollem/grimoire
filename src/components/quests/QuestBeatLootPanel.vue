<template>
  <section class="space-y-3 rounded-lg border border-border bg-card p-3" aria-label="Beat loot">
    <LootPlacementList title="Beat loot" empty-label="No loot prepared for this beat." :loot="loot" />

    <div data-testid="beat-loot-form" class="grid min-w-0 grid-cols-[minmax(0,8rem)_minmax(0,1fr)] gap-2">
      <AppSelect v-model="kind" class="min-w-0" aria-label="Loot kind">
        <option value="item">Item</option>
        <option value="currency">Currency</option>
      </AppSelect>
      <EntityCombobox v-if="kind === 'item'" v-model="itemId" class="min-w-0" :options="itemOptions" placeholder="Find an Item Vault item…" />
      <AppInput v-else v-model="label" class="min-w-0" placeholder="Currency label (optional)" />
      <div class="col-span-2 flex justify-end">
        <AppButton label="Prepare" size="sm" :disabled="!canAdd" :loading="adding" @click="add" />
      </div>
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
import { useCreateLootPlacement } from "@/composables/quests/useQuestFlow";
import { useItems } from "@/composables/items/useItems";
import { useAuthStore } from "@/stores/auth";
import type { QuestBeat, LootPlacement, LootPlacementKind } from "@/types/quest.types";
import AppButton from "@/components/common/AppButton.vue";
import AppInput from "@/components/common/AppInput.vue";
import AppSelect from "@/components/common/AppSelect.vue";
import EntityCombobox from "@/components/common/EntityCombobox.vue";
import LootPlacementList from "@/components/quests/LootPlacementList.vue";

const props = defineProps<{ beat: QuestBeat; loot: LootPlacement[] }>();
const emit = defineEmits<{ dirty: [dirty: boolean] }>();
const auth = useAuthStore();
const { data: items } = useItems();
const createLoot = useCreateLootPlacement();
const kind = ref<Extract<LootPlacementKind, "item" | "currency">>("item");
const itemId = ref("");
const label = ref("");
const quantity = ref(1);
const coins = ["pp", "gp", "ep", "sp", "cp"] as const;
const currency = reactive<Record<(typeof coins)[number], number>>({ pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 });
const adding = ref(false);
const error = ref("");
const itemOptions = computed(() => (items.value ?? [])
  .filter((item) => item.user_id === auth.user?.id || item.campaign_id === props.beat.campaign_id)
  .map((item) => ({ id: item.id, name: item.name })));
const canAdd = computed(() => kind.value === "item" ? !!itemId.value && quantity.value > 0 : coins.some((coin) => currency[coin] > 0));
const isDraftDirty = computed(() => !!itemId.value || !!label.value.trim() || quantity.value !== 1 || coins.some((coin) => currency[coin] > 0));

watch(kind, () => { itemId.value = ""; label.value = ""; error.value = ""; });
watch(isDraftDirty, (dirty) => emit("dirty", dirty), { immediate: true });

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
</script>
