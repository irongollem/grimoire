<template>
  <div class="relative">
    <!-- Transparent click-outside overlay -->
    <div v-if="open" class="fixed inset-0 z-10" @click="open = false" />

    <AppButton
      variant="subtle"
      size="md"
      :icon="IconSend"
      :icon-right="IconChevronDown"
      label="Send to…"
      @click="open = !open"
    />

    <div
      v-if="open"
      class="absolute right-0 top-full mt-1.5 w-52 bg-card border border-border rounded-md shadow-lg z-20 py-1 overflow-hidden"
    >
      <!-- Party stash -->
      <AppButton
        variant="menu"
        size="sm"
        block
        class="rounded-none"
        :disabled="isAddingToStash"
        :label="isAddingToStash ? 'Adding…' : 'Add to Party Stash'"
        @click="addToStash"
      >
        <template #icon>
          <IconArchive class="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        </template>
      </AppButton>

      <!-- Assign to player -->
      <div>
        <AppButton
          variant="menu"
          size="sm"
          block
          class="rounded-none"
          @click="showPlayerPicker = !showPlayerPicker"
        >
          <template #icon>
            <IconUser class="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          </template>
          <span class="flex-1 text-left">Assign to Player</span>
          <IconChevronRight
            class="h-3 w-3 text-muted-foreground shrink-0 transition-transform"
            :class="{ 'rotate-90': showPlayerPicker }"
          />
        </AppButton>

        <div v-if="showPlayerPicker" class="border-t border-border/50 bg-muted/40">
          <p v-if="!party?.length" class="px-4 py-2 text-caption text-muted-foreground italic">
            No party members yet.
          </p>
          <AppButton
            v-for="member in party"
            :key="member.id"
            variant="menu"
            size="body"
            block
            class="rounded-none"
            :disabled="assigningTo === member.id"
            :label="assigningTo === member.id ? 'Adding…' : member.name"
            @click="assignToPlayer(member)"
          />
        </div>
      </div>

      <div class="border-t border-border/50 my-1" />

      <!-- Drop in chat -->
      <AppButton
        variant="menu"
        size="sm"
        block
        class="rounded-none"
        :disabled="isDroppingInChat"
        :label="isDroppingInChat ? 'Dropping…' : 'Drop in Chat'"
        @click="dropInChat"
      >
        <template #icon>
          <IconComment class="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        </template>
      </AppButton>
    </div>

    <!-- Brief confirmation -->
    <Transition name="fade">
      <span v-if="confirmation" class="absolute right-0 -bottom-6 whitespace-nowrap text-caption text-primary">
        {{ confirmation }}
      </span>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { IconArchive, IconChevronDown, IconChevronRight, IconComment, IconSend, IconUser } from '@/lib/icons';
import AppButton from "@/components/common/AppButton.vue";
import { useUiStore } from "@/stores/ui";
import { useParty } from "@/composables/party/useParty";
import { useAddInventoryItem } from "@/composables/items/usePartyInventory";
import { useCampaignMessages } from "@/composables/campaign/useCampaignMessages";
import { useEnsureOwnedItem } from "@/composables/items/useItems";
import type { Item } from "@/types/item.types";
import type { PartyMember } from "@/types/party.types";

const props = defineProps<{ item: Item }>();

const ui = useUiStore();
const { data: party } = useParty();
const { mutateAsync: addInventoryItem } = useAddInventoryItem();
const { sendItemDrop } = useCampaignMessages();
const { ensureOwnedItem } = useEnsureOwnedItem();

const open = ref(false);
const showPlayerPicker = ref(false);
const isAddingToStash = ref(false);
const assigningTo = ref<string | null>(null);
const isDroppingInChat = ref(false);
const confirmation = ref("");

function showConfirmation(msg: string) {
  confirmation.value = msg;
  setTimeout(() => { confirmation.value = ""; }, 2500);
}

function tiptapToPlainText(content: string): string {
  try {
    const doc = JSON.parse(content) as { type: string; text?: string; content?: unknown[] };
    function extract(node: { type: string; text?: string; content?: unknown[] }): string {
      if (node.type === "text") return node.text ?? "";
      if (node.content) {
        const inner = (node.content as typeof node[]).map(extract).join("");
        return node.type === "paragraph" ? inner + " " : inner;
      }
      return "";
    }
    return extract(doc).trim();
  } catch {
    return typeof content === "string" ? content.slice(0, 200) : "";
  }
}

async function addToStash() {
  isAddingToStash.value = true;
  try {
    const owned = await ensureOwnedItem(props.item);
    await addInventoryItem({
      item_id: owned.id,
      library_item_id: null,
      name: props.item.name,
      quantity: 1,
      carried_by: null,
      location: "backpack",
      slot: null,
      is_container: false,
      container_id: null,
      is_attuned: false,
      is_equipped: false,
      notes: null,
      is_ruined: false,
      is_identified: props.item.rarity === 'mundane',
    });
    open.value = false;
    showConfirmation("Added to party stash");
  } finally {
    isAddingToStash.value = false;
  }
}

async function assignToPlayer(member: PartyMember) {
  assigningTo.value = member.id;
  try {
    const owned = await ensureOwnedItem(props.item);
    await addInventoryItem({
      item_id: owned.id,
      library_item_id: null,
      name: props.item.name,
      quantity: 1,
      carried_by: member.id,
      location: "backpack",
      slot: null,
      is_container: false,
      container_id: null,
      is_attuned: false,
      is_equipped: false,
      notes: null,
      is_ruined: false,
      is_identified: props.item.rarity === 'mundane',
    });
    open.value = false;
    showConfirmation(`Assigned to ${member.name}`);
  } finally {
    assigningTo.value = null;
  }
}

async function dropInChat() {
  isDroppingInChat.value = true;
  try {
    // A non-mundane item arrives unidentified (mirrors `is_identified` above), so
    // the public drop card must show only the mundane appearance — never the
    // identified art/description, which would spoil it in the chat payload.
    const unidentified = props.item.rarity !== "mundane";
    const imageUrl = unidentified ? props.item.mundane_image_url : props.item.image_url;
    const descSource = unidentified ? props.item.mundane_description : props.item.description;
    const description = descSource
      ? tiptapToPlainText(descSource).slice(0, 200) || null
      : null;
    // A claimed drop lands in party_inventory.item_id (hard FK) via
    // claim_item_drop — the id embedded in the chat card must already be owned.
    const owned = await ensureOwnedItem(props.item);
    await sendItemDrop(
      props.item.name,
      owned.id,
      1,
      props.item.rarity,
      undefined,
      imageUrl,
      description,
      props.item.tags?.includes("container") ?? false,
    );
    open.value = false;
    ui.chatOpen = true;
  } finally {
    isDroppingInChat.value = false;
  }
}
</script>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
