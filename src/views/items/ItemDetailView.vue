<template>
  <PageHeader
    :title="item?.name ?? 'New Item'"
    :description="item ? subtitle : 'Fill in the details to add an item to your vault'"
  >
    <template #actions>
      <!-- SRD/shared items are strictly read-only in the vault; cloning mints
           an owned, editable copy that shadows the shared row afterwards. -->
      <template v-if="!isNewItem && isShared">
        <AppButton
          size="md"
          collapse-below="lg"
          collapse-label-on-mobile
          variant="primary"
          :label="isCloning ? 'Cloning…' : 'Clone to customize'"
          :disabled="isCloning"
          :icon="IconCopy"
          @click="cloneToCustomize"
        />
      </template>

      <!-- View-mode controls (existing, owned items only) -->
      <template v-if="!isNewItem && !isShared && !isEditing">
        <ItemSendMenu v-if="item" :item="item" />
        <AppButton
          size="md"
          collapse-below="lg"
          collapse-label-on-mobile
          label="Edit"
          :icon="IconEdit"
          @click="startEditing"
        />
      </template>

      <!-- Edit-mode actions (owned items only; shared rows never enter edit mode) -->
      <template v-if="isEditing && itemDetail">
        <AppButton
          v-if="!isNewItem"
          size="md"
          collapse-below="lg"
          collapse-label-on-mobile
          label="View"
          :icon="IconDocument"
          @click="stopEditing"
        />
        <AppButton
          v-if="item"
          size="md"
          collapse-below="lg"
          collapse-label-on-mobile
          :label="itemDetail.isSendingToScriptorium ? 'Sending…' : 'Scriptorium'"
          :tooltip="itemDetail.isSendingToScriptorium ? 'Sending…' : 'Send to Scriptorium'"
          :disabled="itemDetail.isSendingToScriptorium"
          :icon="IconScrollText"
          @click="itemDetail.sendToScriptorium()"
        />
        <AppButton
          v-if="item"
          size="md"
          collapse-below="lg"
          collapse-label-on-mobile
          :label="itemDetail.isCloning ? 'Cloning…' : 'Clone'"
          :disabled="itemDetail.isCloning"
          :icon="IconCopy"
          @click="itemDetail.cloneItem()"
        />
        <AppButton
          v-if="item"
          size="md"
          collapse-below="lg"
          collapse-label-on-mobile
          variant="destructive"
          :label="itemDetail.isDeleting ? 'Deleting…' : 'Delete'"
          :disabled="itemDetail.isDeleting"
          :icon="IconDelete"
          @click="itemDetail.confirmDelete()"
        />
        <AppButton
          size="md"
          collapse-below="lg"
          variant="primary"
          :disabled="itemDetail.isSaving || !itemDetail.canSave"
          :label="itemDetail.isSaving ? 'Saving…' : item ? 'Save' : 'Create'"
          :mobile-label="itemDetail.isSaving ? 'Saving…' : item ? 'Save' : 'Create'"
          :icon="IconSave"
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
import { IconCopy, IconDelete, IconDocument, IconEdit, IconSave, IconScrollText } from '@/lib/icons';
import { useResolvedItem, useEnsureOwnedItem } from "@/composables/useItems";
import { useToast } from "@/composables/useToast";
import { ITEM_TYPE_LABELS, ITEM_RARITY_LABELS } from "@/types/item.types";
import PageHeader from "@/components/common/PageHeader.vue";
import AppButton from "@/components/common/AppButton.vue";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import ItemDetail from "@/components/items/ItemDetail.vue";
import ItemSheet from "@/components/items/ItemSheet.vue";
import ItemSendMenu from "@/components/items/ItemSendMenu.vue";

const route = useRoute();
const router = useRouter();
const toast = useToast();

const isNewItem = computed(() => route.name === "vault-new");
const id = computed(() => (isNewItem.value ? "" : (route.params.id as string)));

const { data: resolvedData, isLoading: itemLoading } = useResolvedItem(id);
const item = computed(() => resolvedData.value?.item ?? null);
// Shared/SRD rows are strictly read-only — ?edit=true is never honored for them.
const isShared = computed(() => resolvedData.value?.isShared === true);
const isEditing = computed(() => !isShared.value && (isNewItem.value || route.query.edit === "true"));

const itemDetail = ref<InstanceType<typeof ItemDetail> | null>(null);

function startEditing() {
  router.replace({ query: { ...route.query, edit: "true" } });
}
function stopEditing() {
  const q = { ...route.query };
  delete q.edit;
  router.replace({ query: q });
}

const isLoading = computed(() => !isNewItem.value && itemLoading.value);

const { ensureOwnedItem } = useEnsureOwnedItem();
const isCloning = ref(false);
async function cloneToCustomize() {
  if (!item.value) return;
  isCloning.value = true;
  try {
    const clone = await ensureOwnedItem(item.value);
    router.replace(`/vault/${clone.id}?edit=true`);
  } catch (e) {
    toast.error(toast.fromError(e, "Failed to clone item. Please try again."));
  } finally {
    isCloning.value = false;
  }
}

const subtitle = computed(() => {
  if (!item.value) return "";
  const parts: string[] = [];
  if (item.value.item_type) parts.push(ITEM_TYPE_LABELS[item.value.item_type] ?? item.value.item_type);
  if (item.value.rarity) parts.push(ITEM_RARITY_LABELS[item.value.rarity] ?? item.value.rarity);
  return parts.join(" · ");
});
</script>
