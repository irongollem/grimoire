<template>
  <PageHeader
    :title="item?.name ?? 'New Item'"
    :description="
      item ? subtitle : 'Fill in the details to add an item to your vault'
    "
  >
    <div v-if="isLoading" class="flex justify-center py-16">
      <LoadingSpinner />
    </div>

    <ItemDetail
      v-else
      :item="isNewItem ? null : (item ?? null)"
      :prefill-name="
        isNewItem ? (route.query.name as string | undefined) : undefined
      "
    />
  </PageHeader>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useRoute } from "vue-router";
import { useItem } from "@/composables/useItems";
import { ITEM_TYPE_LABELS, ITEM_RARITY_LABELS } from "@/types/item.types";
import PageHeader from "@/components/common/PageHeader.vue";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import ItemDetail from "@/components/items/ItemDetail.vue";

const route = useRoute();
const isNewItem = computed(() => route.name === "vault-new");
const id = computed(() => (isNewItem.value ? "" : (route.params.id as string)));
const { data: item, isLoading: itemLoading } = useItem(id.value);
const isLoading = computed(() => !isNewItem.value && itemLoading.value);

const subtitle = computed(() => {
  if (!item.value) return "";
  const parts: string[] = [];
  if (item.value.item_type)
    parts.push(ITEM_TYPE_LABELS[item.value.item_type] ?? item.value.item_type);
  if (item.value.rarity)
    parts.push(ITEM_RARITY_LABELS[item.value.rarity] ?? item.value.rarity);
  return parts.join(" · ");
});
</script>
