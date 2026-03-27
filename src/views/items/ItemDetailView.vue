<template>
  <PageHeader
    :title="item?.name ?? 'New Item'"
    :description="item ? subtitle : 'Fill in the details to add an item to your vault'"
  >
    <template v-if="!isNewItem" #actions>
      <button
        v-if="!isEditing"
        type="button"
        class="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 font-cinzel text-xs font-semibold text-muted-foreground hover:text-foreground hover:border-foreground/40 transition-colors"
        @click="startEditing"
      >
        <Pencil class="h-3.5 w-3.5" />
        Edit
      </button>
      <button
        v-else
        type="button"
        class="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 font-cinzel text-xs font-semibold text-muted-foreground hover:text-foreground hover:border-foreground/40 transition-colors"
        @click="stopEditing"
      >
        <Eye class="h-3.5 w-3.5" />
        View
      </button>
    </template>

    <div v-if="isLoading" class="flex justify-center py-16">
      <LoadingSpinner />
    </div>
    <template v-else>
      <ItemSheet v-if="!isEditing && item" :item="item" />
      <ItemDetail
        v-else
        :item="isNewItem ? null : (item ?? null)"
        :prefill-name="isNewItem ? (route.query.name as string | undefined) : undefined"
      />
    </template>
  </PageHeader>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import { Pencil, Eye } from "lucide-vue-next";
import { useItem } from "@/composables/useItems";
import { ITEM_TYPE_LABELS, ITEM_RARITY_LABELS } from "@/types/item.types";
import PageHeader from "@/components/common/PageHeader.vue";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import ItemDetail from "@/components/items/ItemDetail.vue";
import ItemSheet from "@/components/items/ItemSheet.vue";

const route = useRoute();
const router = useRouter();

const isNewItem = computed(() => route.name === "vault-new");
const id = computed(() => (isNewItem.value ? "" : (route.params.id as string)));
const isEditing = computed(() => isNewItem.value || route.query.edit === "true");

function startEditing() {
  router.replace({ query: { ...route.query, edit: "true" } });
}
function stopEditing() {
  const q = { ...route.query };
  delete q.edit;
  router.replace({ query: q });
}

const { data: item, isLoading: itemLoading } = useItem(id.value);
const isLoading = computed(() => !isNewItem.value && itemLoading.value);

const subtitle = computed(() => {
  if (!item.value) return "";
  const parts: string[] = [];
  if (item.value.item_type) parts.push(ITEM_TYPE_LABELS[item.value.item_type] ?? item.value.item_type);
  if (item.value.rarity) parts.push(ITEM_RARITY_LABELS[item.value.rarity] ?? item.value.rarity);
  return parts.join(" · ");
});
</script>
