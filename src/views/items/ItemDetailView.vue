<template>
  <!-- Mobile read view (<md): standalone scrollable layer with its own app bar.
       Desktop and all edit modes fall through to the PageHeader block below,
       which is unchanged. -->
  <ItemSheetMobile v-if="showMobileRead && item" :item="item" />

  <!-- Mobile edit view (<md): ItemDetail renders its own ItemEditMobile layer
       (app bar + stacked cards + save bar). It does not need the PageHeader
       chrome, so we render ItemDetail directly. -->
  <ItemDetail
    v-else-if="showMobileEdit"
    :key="id"
    :item="isNewItem ? null : (item ?? null)"
    :prefill-name="isNewItem ? (route.query.name as string | undefined) : undefined"
  />

  <PageHeader
    v-else
    :title="item?.name ?? 'New Item'"
    :description="item ? subtitle : 'Fill in the details to add an item to your vault'"
  >
    <template #actions>
      <!-- View-mode controls (existing items only) -->
      <template v-if="!isNewItem && !isEditing">
        <ItemSendMenu v-if="item" :item="item" />
        <PageHeaderAction
          type="button"
          label="Edit"
          :icon="IconEdit"
          @click="startEditing"
        />
      </template>

      <!-- Edit-mode actions -->
      <template v-if="isEditing && itemDetail">
        <PageHeaderAction
          v-if="!isNewItem"
          type="button"
          label="View"
          :icon="IconDocument"
          @click="stopEditing"
        />
        <PageHeaderAction
          v-if="item"
          type="button"
          :label="itemDetail.isSendingToScriptorium ? 'Sending…' : 'Scriptorium'"
          :title="itemDetail.isSendingToScriptorium ? 'Sending…' : 'Send to Scriptorium'"
          :disabled="itemDetail.isSendingToScriptorium"
          :icon="IconScrollText"
          @click="itemDetail.sendToScriptorium()"
        />
        <PageHeaderAction
          v-if="item"
          type="button"
          :label="itemDetail.isCloning ? 'Cloning…' : 'Clone'"
          :disabled="itemDetail.isCloning"
          :icon="IconCopy"
          @click="itemDetail.cloneItem()"
        />
        <PageHeaderAction
          v-if="item"
          type="button"
          :label="itemDetail.isDeleting ? 'Deleting…' : 'Delete'"
          :disabled="itemDetail.isDeleting"
          :icon="IconDelete"
          variant="destructive"
          @click="itemDetail.confirmDelete()"
        />
        <PageHeaderAction
          type="button"
          :disabled="itemDetail.isSaving || !itemDetail.canSave"
          :label="itemDetail.isSaving ? 'Saving…' : item ? 'Save' : 'Create'"
          :mobile-label="itemDetail.isSaving ? 'Saving…' : item ? 'Save' : 'Create'"
          :icon="IconSave"
          variant="primary"
          :hide-label-on-mobile="false"
          @click="itemDetail.save()"
        />
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
import { useMediaQuery } from "@vueuse/core";
import { IconCopy, IconDelete, IconDocument, IconEdit, IconSave, IconScrollText } from '@/lib/icons';
import { useItem } from "@/composables/useItems";
import { ITEM_TYPE_LABELS, ITEM_RARITY_LABELS } from "@/types/item.types";
import PageHeader from "@/components/common/PageHeader.vue";
import PageHeaderAction from "@/components/common/PageHeaderAction.vue";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import ItemDetail from "@/components/items/ItemDetail.vue";
import ItemSheet from "@/components/items/ItemSheet.vue";
import ItemSheetMobile from "@/components/items/ItemSheetMobile.vue";
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

// Mobile-only layers (<md). Desktop keeps the existing PageHeader +
// ItemSheet/ItemDetail chrome, byte-identical to before.
const isMobile = useMediaQuery("(max-width: 767px)");
const showMobileRead = computed(() => isMobile.value && !isEditing.value && !isNewItem.value);
// Mobile edit: new item, or existing item opened with ?edit=true. ItemDetail
// owns its own mobile chrome (ItemEditMobile), so no PageHeader here.
const showMobileEdit = computed(() => isMobile.value && isEditing.value && !isLoading.value);

const subtitle = computed(() => {
  if (!item.value) return "";
  const parts: string[] = [];
  if (item.value.item_type) parts.push(ITEM_TYPE_LABELS[item.value.item_type] ?? item.value.item_type);
  if (item.value.rarity) parts.push(ITEM_RARITY_LABELS[item.value.rarity] ?? item.value.rarity);
  return parts.join(" · ");
});
</script>
