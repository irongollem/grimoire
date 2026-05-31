<template>
  <!--
    Mobile-only (<md) bottom-sheet wrapper around the same item-distribution
    logic as the desktop ItemSendMenu dropdown: add to party stash, assign to a
    player, or drop in chat. Identical composable wiring — only the chrome
    differs (MobileSheet vs. a floating dropdown).
  -->
  <MobileSheet v-model:open="open" :title="`Send ${item.name}`">
    <div class="flex flex-col gap-1 pb-2">
      <!-- Party stash -->
      <button
        type="button"
        :disabled="isAddingToStash"
        class="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left font-fell text-sm text-foreground active:bg-muted/50 disabled:opacity-50"
        @click="addToStash"
      >
        <IconArchive class="size-4 shrink-0 text-muted-foreground" />
        {{ isAddingToStash ? "Adding…" : "Add to Party Stash" }}
      </button>

      <!-- Assign to player -->
      <button
        type="button"
        class="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-3 text-left font-fell text-sm text-foreground active:bg-muted/50"
        @click="showPlayerPicker = !showPlayerPicker"
      >
        <span class="flex items-center gap-3">
          <IconUser class="size-4 shrink-0 text-muted-foreground" />
          Assign to Player
        </span>
        <IconChevronRight
          class="size-3.5 text-muted-foreground transition-transform"
          :class="{ 'rotate-90': showPlayerPicker }"
        />
      </button>

      <div v-if="showPlayerPicker" class="ml-2 flex flex-col gap-1 border-l border-border/50 pl-3">
        <p v-if="!party?.length" class="px-3 py-2 font-fell text-xs italic text-muted-foreground">
          No party members yet.
        </p>
        <button
          v-for="member in party"
          :key="member.id"
          type="button"
          :disabled="assigningTo === member.id"
          class="w-full rounded-lg px-3 py-2.5 text-left font-fell text-sm text-foreground active:bg-muted/50 disabled:opacity-50"
          @click="assignToPlayer(member)"
        >
          {{ assigningTo === member.id ? "Adding…" : member.name }}
        </button>
      </div>

      <div class="my-1 border-t border-border/50" />

      <!-- Drop in chat -->
      <button
        type="button"
        :disabled="isDroppingInChat"
        class="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left font-fell text-sm text-foreground active:bg-muted/50 disabled:opacity-50"
        @click="dropInChat"
      >
        <IconComment class="size-4 shrink-0 text-muted-foreground" />
        {{ isDroppingInChat ? "Dropping…" : "Drop in Chat" }}
      </button>
    </div>
  </MobileSheet>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { IconArchive, IconChevronRight, IconComment, IconUser } from "@/lib/icons";
import MobileSheet from "@/components/common/MobileSheet.vue";
import { useUiStore } from "@/stores/ui";
import { useParty } from "@/composables/useParty";
import { useAddInventoryItem } from "@/composables/usePartyInventory";
import { useCampaignMessages } from "@/composables/useCampaignMessages";
import type { Item } from "@/types/item.types";
import type { PartyMember } from "@/types/party.types";

const { item } = defineProps<{ item: Item }>();
const open = defineModel<boolean>("open", { required: true });

const ui = useUiStore();
const { data: party } = useParty();
const { mutateAsync: addInventoryItem } = useAddInventoryItem();
const { sendItemDrop } = useCampaignMessages();

const showPlayerPicker = ref(false);
const isAddingToStash = ref(false);
const assigningTo = ref<string | null>(null);
const isDroppingInChat = ref(false);

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
    await addInventoryItem({
      item_id: item.id,
      name: item.name,
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
      is_identified: item.rarity === "mundane",
    });
    open.value = false;
  } finally {
    isAddingToStash.value = false;
  }
}

async function assignToPlayer(member: PartyMember) {
  assigningTo.value = member.id;
  try {
    await addInventoryItem({
      item_id: item.id,
      name: item.name,
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
      is_identified: item.rarity === "mundane",
    });
    open.value = false;
  } finally {
    assigningTo.value = null;
  }
}

async function dropInChat() {
  isDroppingInChat.value = true;
  try {
    const description = item.description
      ? tiptapToPlainText(item.description).slice(0, 200) || null
      : null;
    await sendItemDrop(
      item.name,
      item.id,
      1,
      item.rarity,
      undefined,
      item.image_url,
      description,
    );
    open.value = false;
    ui.chatOpen = true;
  } finally {
    isDroppingInChat.value = false;
  }
}
</script>
