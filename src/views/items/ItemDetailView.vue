<template>
  <PageHeader
    :title="item?.name ?? 'New Item'"
    :description="item ? subtitle : 'Fill in the details to add an item to your vault'"
  >
    <template #actions>
      <!-- View-mode controls (existing items only) -->
      <template v-if="!isNewItem && !isEditing">
        <ItemSendMenu v-if="item" :item="item" />
        <button
          type="button"
          class="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 font-cinzel text-xs font-semibold text-muted-foreground hover:text-foreground hover:border-foreground/40 transition-colors"
          @click="startEditing"
        >
          <IconEdit class="h-3.5 w-3.5" />
          Edit
        </button>
      </template>

      <!-- Edit-mode actions -->
      <template v-if="isEditing && itemDetail">
        <button
          v-if="!isNewItem"
          type="button"
          class="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 font-cinzel text-xs font-semibold text-muted-foreground hover:text-foreground hover:border-foreground/40 transition-colors"
          @click="stopEditing"
        >
          <IconReveal class="h-3.5 w-3.5" />
          View
        </button>
        <button
          v-if="item"
          type="button"
          :disabled="itemDetail.isSendingToScriptorium"
          class="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 font-cinzel text-xs font-semibold text-muted-foreground hover:text-foreground hover:border-foreground/40 transition-colors disabled:opacity-50"
          @click="itemDetail.sendToScriptorium()"
        >
          <IconScrollText class="h-3.5 w-3.5" />
          {{ itemDetail.isSendingToScriptorium ? "Sending…" : "Scriptorium" }}
        </button>
        <button
          v-if="item"
          type="button"
          :disabled="itemDetail.isCloning"
          class="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 font-cinzel text-xs font-semibold text-muted-foreground hover:text-foreground hover:border-foreground/40 transition-colors disabled:opacity-50"
          @click="itemDetail.cloneItem()"
        >
          <IconCopy class="h-3.5 w-3.5" />
          {{ itemDetail.isCloning ? "Cloning…" : "Clone" }}
        </button>
        <button
          v-if="item"
          type="button"
          :disabled="itemDetail.isDeleting"
          class="px-3 py-1.5 font-cinzel text-xs font-semibold tracking-wider text-destructive border border-destructive/40 rounded-md hover:bg-destructive/10 transition-colors disabled:opacity-50"
          @click="itemDetail.confirmDelete()"
        >
          {{ itemDetail.isDeleting ? "Deleting…" : "Delete" }}
        </button>
        <button
          type="button"
          :disabled="itemDetail.isSaving || !itemDetail.canSave"
          class="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 font-cinzel text-xs font-semibold text-primary-foreground tracking-wider hover:opacity-90 transition-opacity disabled:opacity-50"
          @click="itemDetail.save()"
        >
          <IconSave class="h-3.5 w-3.5" />
          {{ itemDetail.isSaving ? "Saving…" : item ? "IconSave" : "Create" }}
        </button>
      </template>
    </template>

    <div v-if="isLoading" class="flex justify-center py-16">
      <LoadingSpinner />
    </div>
    <template v-else>
      <ItemSheet v-if="!isEditing && item" :item="item" />
      <ItemDetail
        v-else
        ref="itemDetail"
        :key="id"
        :item="isNewItem ? null : (item ?? null)"
        :prefill-name="isNewItem ? (route.query.name as string | undefined) : undefined"
      />
    </template>
  </PageHeader>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import { IconCopy, IconEdit, IconReveal, IconSave, IconScrollText } from '@/lib/icons';
import { useItem } from "@/composables/useItems";
import { ITEM_TYPE_LABELS, ITEM_RARITY_LABELS } from "@/types/item.types";
import PageHeader from "@/components/common/PageHeader.vue";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import ItemDetail from "@/components/items/ItemDetail.vue";
import ItemSheet from "@/components/items/ItemSheet.vue";
import ItemSendMenu from "@/components/items/ItemSendMenu.vue";

const route = useRoute();
const router = useRouter();

const isNewItem = computed(() => route.name === "vault-new");
const id = computed(() => (isNewItem.value ? "" : (route.params.id as string)));
const isEditing = computed(() => isNewItem.value || route.query.edit === "true");

const itemDetail = ref<InstanceType<typeof ItemDetail> | null>(null);

function startEditing() {
  router.replace({ query: { ...route.query, edit: "true" } });
}
function stopEditing() {
  const q = { ...route.query };
  delete q.edit;
  router.replace({ query: q });
}

const { data: item, isLoading: itemLoading } = useItem(id);
const isLoading = computed(() => !isNewItem.value && itemLoading.value);

const subtitle = computed(() => {
  if (!item.value) return "";
  const parts: string[] = [];
  if (item.value.item_type) parts.push(ITEM_TYPE_LABELS[item.value.item_type] ?? item.value.item_type);
  if (item.value.rarity) parts.push(ITEM_RARITY_LABELS[item.value.rarity] ?? item.value.rarity);
  return parts.join(" · ");
});
</script>
