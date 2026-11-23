<template>
  <section class="space-y-3 rounded-lg border border-border bg-card/50 p-3" aria-label="Catalogue item">
    <template v-if="pendingLink">
      <p class="text-body">{{ pendingLink.name }} is ready in the Item Vault.</p>
      <AppButton variant="primary" size="sm" label="Retry link" :disabled="busy" @click="link(pendingLink.id)" />
    </template>
    <template v-else-if="mode === 'link'">
      <form class="space-y-2" @submit.prevent="link(pickedId)">
        <EntityCombobox v-model="pickedId" :options="catalogue" placeholder="Find an item to link…">
          <template #option="{ opt }">
            <span class="min-w-0 flex-1 truncate">{{ opt.name }}</span>
            <span class="shrink-0 text-caption-sm capitalize text-muted-foreground">{{ opt.rarity }}</span>
          </template>
        </EntityCombobox>
        <div class="flex flex-wrap gap-2">
          <AppButton type="submit" variant="primary" size="sm" label="Link item" :disabled="!pickedId || busy" />
          <AppButton variant="ghost" size="sm" label="Cancel" :disabled="busy" @click="cancel" />
        </div>
      </form>
    </template>
    <InventoryCatalogueCreate
      v-else-if="mode"
      :mode="mode"
      :name="item.name"
      :notes="item.notes"
      :campaign-id="item.campaign_id"
      @created="linkCreated"
      @cancel="cancel"
      @busy="authoring = $event"
    />
    <template v-else>
      <p class="text-body font-semibold">Make this a catalogue item</p>
      <div class="flex flex-wrap gap-2">
        <AppButton variant="subtle" size="sm" label="Link existing" @click="chooseExisting" />
        <AppButton variant="subtle" size="sm" label="Create item" @click="mode = 'manual'" />
        <AppButton v-if="aiEnabled" variant="subtle" size="sm" label="Generate with AI" @click="mode = 'ai'" />
      </div>
    </template>
    <p v-if="errorMessage" class="text-caption text-destructive" role="alert">{{ errorMessage }}</p>
  </section>
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent, ref, watch } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import EntityCombobox from "@/components/common/controls/EntityCombobox.vue";
import { useLinkInventoryCatalogueItem } from "@/composables/items/usePartyInventory";
import { useToast } from "@/composables/useToast";
import { uniqueCatalogueMatch } from "@/lib/items/itemCatalogueNames";
import type { PartyInventoryItem } from "@/types/inventory.types";
import type { Item, ItemIndexEntry } from "@/types/item.types";

const InventoryCatalogueCreate = defineAsyncComponent(() => import("./InventoryCatalogueCreate.vue"));
const { item, catalogue, aiEnabled } = defineProps<{
  item: PartyInventoryItem;
  catalogue: ItemIndexEntry[];
  aiEnabled: boolean;
}>();
const emit = defineEmits<{ linked: [item: PartyInventoryItem]; busy: [busy: boolean] }>();
const { mutateAsync: updateLink } = useLinkInventoryCatalogueItem();
const toast = useToast();
const mode = ref<"link" | "manual" | "ai" | null>(null);
const pickedId = ref("");
const pendingLink = ref<Item | null>(null);
const errorMessage = ref<string | null>(null);
const authoring = ref(false);
const linking = ref(false);
const busy = computed(() => authoring.value || linking.value);
watch(busy, (value) => emit("busy", value), { flush: "sync" });

function chooseExisting() {
  pickedId.value = uniqueCatalogueMatch(item.name, catalogue)?.id ?? "";
  mode.value = "link";
}

function cancel() {
  if (busy.value) return;
  errorMessage.value = null;
  mode.value = null;
}

async function link(catalogueId: string) {
  if (!catalogueId || linking.value) return;
  linking.value = true;
  errorMessage.value = null;
  try {
    const linked = await updateLink({ inventoryId: item.id, campaignId: item.campaign_id, catalogueId });
    toast.success(`Linked ${linked.name} to the catalogue.`);
    emit("linked", linked);
  } catch (error) {
    errorMessage.value = toast.fromError(error, "Couldn't link this item.");
  } finally {
    linking.value = false;
  }
}

function linkCreated(created: Item) {
  pendingLink.value = created;
  void link(created.id);
}
</script>
