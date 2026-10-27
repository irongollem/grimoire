<template>
  <form
    class="flex flex-wrap items-end gap-2 border-b border-border bg-muted/10 px-4 py-3"
    @submit.prevent="submit"
  >
    <div ref="nameField" class="flex min-w-40 flex-2">
      <AppButton
        v-if="draft.customName"
        variant="tinted"
        size="body"
        :icon="IconClose"
        tone="neutral"
        emphasis="strong"
        :label="`${draft.customName} (custom)`"
        tooltip="Remove the custom name"
        @click="clearCustom"
      />
      <EntityCombobox
        v-else
        v-model="draft.selectedItemId"
        :options="catalogItems ?? []"
        placeholder="Search the vault or enter a custom name…"
        @update:model-value="onPick"
      >
        <template #option="{ opt }">
          <span class="truncate">{{ opt.name }}</span>
          <span class="shrink-0 text-caption-sm capitalize text-muted-foreground">{{ opt.rarity }}</span>
        </template>
        <template #footer="{ query, close }">
          <AppButton
            variant="menu"
            size="body"
            block
            :label="`Use &quot;${query}&quot; as a custom item`"
            @mousedown.prevent
            @click="useCustom(query, close)"
          />
          <AppButton
            variant="menu"
            size="body"
            block
            class="text-primary"
            :icon="IconExternalLink"
            :label="`Create &quot;${query}&quot; in Vault`"
            @mousedown.prevent
            @click="router.push({ path: '/vault/new', query: { name: query, redirect: '/party' } })"
          />
        </template>
      </EntityCombobox>
    </div>
    <AppInput
      v-model.number="draft.quantity"
      type="number"
      min="1"
      size="body"
      align="center"
      placeholder="Qty"
      aria-label="Quantity"
      :block="false"
      class="w-16"
    />
    <label class="flex flex-col gap-0.5">
      <span class="text-label text-muted-foreground">Who gets it</span>
      <AppSelect v-model="draft.carriedBy" size="body" weight="normal">
        <option value="">Party stash</option>
        <option v-for="m in members" :key="m.id" :value="m.id">{{ m.name }}</option>
      </AppSelect>
    </label>
    <AppInput
      v-model="draft.notes"
      size="body"
      placeholder="Notes (optional)"
      aria-label="Notes"
      :block="false"
      class="min-w-32 flex-1"
    />
    <div class="ml-auto flex gap-1.5">
      <AppButton variant="subtle" size="sm" label="Cancel" @click="$emit('close')" />
      <AppButton
        variant="tinted"
        size="sm"
        label="Drop in Chat"
        :disabled="!itemName"
        tone="caution"
        emphasis="soft"
        @click="dropToChat"
      />
      <AppButton type="submit" variant="primary" size="sm" label="Add" :disabled="adding" />
    </div>
  </form>
</template>

<script setup lang="ts">
/** The Packs section's add form: a vault search or a custom name, and whose pack it goes into. */
import { computed, nextTick, onMounted, reactive, ref, watch } from "vue";
import { useRouter } from "vue-router";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import EntityCombobox from "@/components/common/controls/EntityCombobox.vue";
import AppSelect from "@/components/common/controls/AppSelect.vue";
import { IconClose, IconExternalLink } from "@/lib/icons";
import { useAddInventoryItem } from "@/composables/items/usePartyInventory";
import { useItemIndex } from "@/composables/items/useItemIndex";
import { useItemsByIds } from "@/composables/items/useItemsByIds";
import { sendCampaignAnnouncement } from "@/composables/campaign/useCampaignBroadcast";
import { useCampaignMessages } from "@/composables/campaign/useCampaignMessages";
import { useChatSendFailure } from "@/composables/campaign/chatSendErrors";
import { useCampaignStore } from "@/stores/campaign";
import { useToast } from "@/composables/useToast";
import { itemRefColumns } from "@/lib/itemRef";
import type { PartyMember } from "@/types/party.types";

const { members } = defineProps<{ members: PartyMember[] }>();
const emit = defineEmits<{ close: [] }>();

const router = useRouter();
const campaign = useCampaignStore();
const toast = useToast();
const { sendItemDrop } = useCampaignMessages();
const { reportChatFailure } = useChatSendFailure();
const { mutateAsync: addInventoryItem, isPending: adding } = useAddInventoryItem();
const { data: catalogItems } = useItemIndex();

const nameField = ref<HTMLElement | null>(null);
// `customName` is a name that is not in the vault; a pick and a custom name exclude each other.
const draft = reactive({ customName: "", quantity: 1, carriedBy: "", notes: "", selectedItemId: "", isAttuned: false });
// The picker lists slim index rows; the one picked is read in full for what the index
// leaves out (whether it needs attunement).
const { data: pickedItems } = useItemsByIds(() => [draft.selectedItemId]);
watch(
  () => pickedItems.value.get(draft.selectedItemId)?.requires_attunement,
  (requires) => {
    if (requires !== undefined) draft.isAttuned = requires;
  },
);

const picked = computed(() => (catalogItems.value ?? []).find((i) => i.id === draft.selectedItemId));
const itemName = computed(() => draft.customName || picked.value?.name || "");

const focusName = () => void nextTick(() => nameField.value?.querySelector("input")?.focus());
onMounted(focusName);

function onPick() {
  draft.isAttuned = false;
}
function useCustom(name: string, close: () => void) {
  draft.customName = name;
  draft.selectedItemId = "";
  draft.isAttuned = false;
  close();
}
function clearCustom() {
  draft.customName = "";
  focusName();
}

async function submit() {
  const name = itemName.value.trim();
  if (!name) {
    // Nothing chosen yet: the combobox is not a native required field.
    focusName();
    return;
  }
  const vaultItem = picked.value;
  try {
    await addInventoryItem({
      name,
      quantity: draft.quantity,
      carried_by: draft.carriedBy || null,
      notes: draft.notes.trim() || null,
      is_attuned: draft.isAttuned,
      ...itemRefColumns(vaultItem?.id),
      is_equipped: false,
      location: "backpack",
      slot: null,
      is_container: false,
      container_id: null,
      is_identified: !vaultItem || vaultItem.rarity === "mundane",
    });
  } catch (e) {
    // Keep the form as typed so the DM can retry.
    toast.error(toast.fromError(e, `Couldn't add "${name}".`));
    return;
  }
  if (campaign.activeCampaignId)
    void sendCampaignAnnouncement(campaign.activeCampaignId, `🎒 Item added to inventory: "${name}"`);
  emit("close");
}

async function dropToChat() {
  const name = itemName.value.trim();
  if (!name) return;
  const rarity = picked.value?.rarity ?? null;
  try {
    await sendItemDrop(name, draft.selectedItemId || null, draft.quantity, rarity);
  } catch (e) {
    // Keep the form as typed so the DM can retry.
    reportChatFailure(e, "drop the item to the chat");
    return;
  }
  emit("close");
}
</script>
