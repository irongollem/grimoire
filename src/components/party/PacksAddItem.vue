<template>
  <form
    class="flex flex-wrap items-end gap-2 border-b border-border bg-muted/10 px-4 py-3"
    @submit.prevent="submit"
  >
    <div class="relative min-w-40 flex-2">
      <AppInput
        ref="nameInput"
        v-model="draft.name"
        size="body"
        placeholder="Search the vault or enter a custom name…"
        aria-label="Item name"
        required
        autocomplete="off"
        @input="onNameInput"
        @focus="onNameInput"
        @keydown.escape="dropdownOpen = false"
        @keydown.down.prevent="focusOption(0)"
      />
      <div
        v-if="dropdownOpen && (catalogItems?.length ?? 0) > 0"
        data-slip
        class="absolute left-0 top-full z-20 mt-0.5 max-h-48 w-full overflow-y-auto rounded-md border border-border bg-card shadow-lg"
      >
        <AppButton
          v-for="(item, idx) in options"
          :key="item.id"
          :ref="(el) => setOptionRef(idx, el)"
          variant="menu"
          size="body"
          block
          class="items-baseline"
          @click="pick(item)"
          @keydown.down.prevent="focusOption(idx + 1)"
          @keydown.up.prevent="idx === 0 ? undefined : focusOption(idx - 1)"
          @keydown.escape="dropdownOpen = false"
        >
          <span class="truncate">{{ item.name }}</span>
          <span class="shrink-0 text-caption-sm capitalize text-muted-foreground">{{ item.rarity }}</span>
        </AppButton>
        <div v-if="draft.name.trim()" class="border-t border-border">
          <AppButton
            variant="menu"
            size="body"
            block
            class="text-primary"
            :icon="IconExternalLink"
            :label="`Create &quot;${draft.name.trim()}&quot; in Vault`"
            @click="router.push({ path: '/vault/new', query: { name: draft.name.trim(), redirect: '/party' } })"
          />
        </div>
      </div>
      <div v-if="dropdownOpen" class="fixed inset-0 z-10" @click="dropdownOpen = false" />
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
        :disabled="!draft.selectedItemId && !draft.name.trim()"
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
import { computed, onMounted, reactive, ref, watch } from "vue";
import { useRouter } from "vue-router";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import AppSelect from "@/components/common/controls/AppSelect.vue";
import type { AppInputHandle } from "@/components/common/controls/fieldVariants";
import { IconExternalLink } from "@/lib/icons";
import { useAddInventoryItem } from "@/composables/items/usePartyInventory";
import { useItemIndex } from "@/composables/items/useItemIndex";
import { useItemsByIds } from "@/composables/items/useItemsByIds";
import { sendCampaignAnnouncement } from "@/composables/campaign/useCampaignBroadcast";
import { useCampaignMessages } from "@/composables/campaign/useCampaignMessages";
import { useChatSendFailure } from "@/composables/campaign/chatSendErrors";
import { useCampaignStore } from "@/stores/campaign";
import { useToast } from "@/composables/useToast";
import { itemRefColumns } from "@/lib/itemRef";
import type { ItemIndexEntry } from "@/types/item.types";
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

const nameInput = ref<AppInputHandle | null>(null);
const draft = reactive({ name: "", quantity: 1, carriedBy: "", notes: "", selectedItemId: "", isAttuned: false });
// The picker lists slim index rows; the one picked is read in full for what the index
// leaves out (whether it needs attunement).
const { data: pickedItems } = useItemsByIds(() => [draft.selectedItemId]);
watch(
  () => pickedItems.value.get(draft.selectedItemId)?.requires_attunement,
  (requires) => {
    if (requires !== undefined) draft.isAttuned = requires;
  },
);

const dropdownOpen = ref(false);
const optionRefs = reactive<Record<number, HTMLButtonElement>>({});
const options = computed((): ItemIndexEntry[] => {
  const q = draft.name.trim().toLowerCase();
  const all = catalogItems.value ?? [];
  return (q ? all.filter((i) => i.name.toLowerCase().includes(q)) : all).slice(0, 8);
});

onMounted(() => nameInput.value?.focus());

function onNameInput() {
  draft.selectedItemId = "";
  dropdownOpen.value = true;
}
function pick(item: ItemIndexEntry) {
  draft.name = item.name;
  draft.selectedItemId = item.id;
  draft.isAttuned = false;
  dropdownOpen.value = false;
}
function focusOption(idx: number) {
  optionRefs[idx]?.focus();
}
// AppButton exposes `$el` (the real <button>) through `ref`; unwrap it for `.focus()`.
function setOptionRef(idx: number, el: unknown) {
  if (el && typeof el === "object" && "$el" in el) optionRefs[idx] = (el as { $el: HTMLButtonElement }).$el;
}

async function submit() {
  const name = draft.name.trim();
  if (!name) return;
  if (!draft.selectedItemId) {
    router.push({ path: "/vault/new", query: { name, redirect: "/party" } });
    return;
  }
  const vaultItem = (catalogItems.value ?? []).find((i) => i.id === draft.selectedItemId);
  try {
    await addInventoryItem({
      name,
      quantity: draft.quantity,
      carried_by: draft.carriedBy || null,
      notes: draft.notes.trim() || null,
      is_attuned: draft.isAttuned,
      ...itemRefColumns(draft.selectedItemId),
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
  const name = draft.name.trim();
  if (!name) return;
  const rarity = (catalogItems.value ?? []).find((i) => i.id === draft.selectedItemId)?.rarity ?? null;
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
