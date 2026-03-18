<template>
  <!-- ── Side panel (md+): part of document flow, squashes content ── -->
  <Transition name="side-panel">
    <aside
      v-if="ui.chatOpen"
      class="hidden md:flex flex-col w-80 shrink-0 border-l border-border bg-card h-full sticky top-0"
    >
      <ChatPanelContent
        :messages="messages"
        :loading="loading"
        :my-user-id="myUserId ?? ''"
        :members="members"
        @send="handleSend"
        @send-roll="handleRoll"
        @delete="deleteMessage"
        @claim="handleClaim"
        @claim-currency="handleClaimCurrency"
        @close="ui.chatOpen = false"
      />
    </aside>
  </Transition>

  <!-- ── Right-edge tab (always visible when panel is closed) ── -->
  <Transition name="tab-fade">
    <button
      v-if="!ui.chatOpen"
      type="button"
      class="chat-no-print fixed right-0 bottom-1/16 -translate-y-1/2 z-40 flex flex-col items-center gap-1.5 px-2 py-3 rounded-l-xl border border-r-0 border-border bg-card text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors shadow-lg"
      title="Open chat"
      @click="ui.toggleChat()"
    >
      <MessageCircle class="h-4 w-4" />
      <span
        v-if="unread > 0"
        class="h-5 w-5 rounded-full bg-destructive text-destructive-foreground font-cinzel text-[10px] font-bold flex items-center justify-center"
        >{{ unread > 9 ? "9+" : unread }}</span
      >
    </button>
  </Transition>

  <!-- ── Mobile: overlay backdrop + slide-up panel ── -->
  <Transition name="fade">
    <div
      v-if="ui.chatOpen"
      class="chat-no-print fixed inset-0 z-40 bg-black/40 md:hidden"
      @click="ui.chatOpen = false"
    />
  </Transition>
  <Transition name="slide-up">
    <div
      v-if="ui.chatOpen"
      class="chat-no-print fixed bottom-0 inset-x-0 z-50 flex flex-col bg-card border-t border-border rounded-t-2xl md:hidden"
      style="height: 65vh"
    >
      <ChatPanelContent
        :messages="messages"
        :loading="loading"
        :my-user-id="myUserId ?? ''"
        :members="members"
        @send="handleSend"
        @send-roll="handleRoll"
        @delete="deleteMessage"
        @claim="handleClaim"
        @claim-currency="handleClaimCurrency"
        @close="ui.chatOpen = false"
      />
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";
import { MessageCircle } from "lucide-vue-next";
import { useUiStore } from "@/stores/ui";
import { useCampaignMessages } from "@/composables/useCampaignMessages";
import { useCampaignMembers } from "@/composables/useCampaignMembers";
import { useAuthStore } from "@/stores/auth";
import { useAddInventoryItem } from "@/composables/usePartyInventory";
import { useParty, useUpdatePartyMember } from "@/composables/useParty";
import ChatPanelContent from "./ChatPanelContent.vue";
import type { RollResult } from "@/lib/dice";
import type { ItemDropMetadata, CurrencyDropMetadata } from "@/types/chat.types";

const ui = useUiStore();
const auth = useAuthStore();
const { messages, loading, sendMessage, sendRoll, claimItemDrop, claimCurrencyDrop, deleteMessage, myUserId } =
  useCampaignMessages();
const { data: members } = useCampaignMembers();
const { data: party }   = useParty();
const { mutateAsync: addInventoryItem }   = useAddInventoryItem();
const { mutateAsync: updatePartyMember }  = useUpdatePartyMember();

const unread = ref(0);

watch(messages, (msgs, prev) => {
  if (!ui.chatOpen && msgs.length > (prev?.length ?? 0)) {
    const newest = msgs[msgs.length - 1];
    if (newest?.user_id !== auth.user?.id) unread.value++;
  }
});

watch(
  () => ui.chatOpen,
  (open) => {
    if (open) unread.value = 0;
  },
);

async function handleClaim({ messageId, intoStash }: { messageId: string; intoStash: boolean }) {
  const msg = messages.value.find(m => m.id === messageId);
  if (!msg || msg.type !== 'item_drop') return;
  const meta = msg.metadata as ItemDropMetadata;
  if (meta.claimed_by_user_id) return;

  const partyMemberId = intoStash ? null : (auth.linkedPartyMemberId ?? null);
  const claimerName = auth.membership?.display_name ?? auth.userEmail ?? 'Someone';

  await claimItemDrop(messageId, claimerName, partyMemberId);
  await addInventoryItem({
    name: meta.item_name,
    quantity: meta.quantity,
    item_id: meta.item_id,
    carried_by: partyMemberId,
    location: 'backpack',
    slot: null,
    is_container: false,
    container_id: null,
    is_attuned: false,
    is_equipped: false,
    notes: null,
  });
}

async function handleClaimCurrency({ messageId }: { messageId: string }) {
  const msg = messages.value.find(m => m.id === messageId);
  if (!msg || msg.type !== 'currency_drop') return;
  const meta = msg.metadata as CurrencyDropMetadata;
  if (meta.claimed_by_user_id) return;

  const partyMemberId = auth.linkedPartyMemberId ?? null;
  const claimerName = auth.membership?.display_name ?? auth.userEmail ?? 'Someone';

  await claimCurrencyDrop(messageId, claimerName, partyMemberId);

  // Add coins to the party member's purse if they have one linked
  if (partyMemberId) {
    const member = (party.value ?? []).find(m => m.id === partyMemberId);
    if (member) {
      await updatePartyMember({
        id: partyMemberId,
        update: {
          pp: member.pp + meta.pp,
          gp: member.gp + meta.gp,
          ep: member.ep + meta.ep,
          sp: member.sp + meta.sp,
          cp: member.cp + meta.cp,
        },
      });
    }
  }
}

async function handleSend({
  text,
  recipientUserId,
}: {
  text: string;
  recipientUserId: string | null;
}) {
  await sendMessage(text, recipientUserId);
}
async function handleRoll({
  result,
  recipientUserId,
}: {
  result: RollResult;
  recipientUserId: string | null;
}) {
  await sendRoll(result, recipientUserId);
}
</script>

<style scoped>
.side-panel-enter-active,
.side-panel-leave-active {
  transition:
    width 0.2s ease,
    opacity 0.2s ease;
  overflow: hidden;
}
.side-panel-enter-from,
.side-panel-leave-to {
  width: 0;
  opacity: 0;
}

.tab-fade-enter-active,
.tab-fade-leave-active {
  transition:
    opacity 0.15s ease,
    transform 0.15s ease;
}
.tab-fade-enter-from,
.tab-fade-leave-to {
  opacity: 0;
  transform: translateY(-50%) translateX(8px);
}

.slide-up-enter-active,
.slide-up-leave-active {
  transition: transform 0.25s ease;
}
.slide-up-enter-from,
.slide-up-leave-to {
  transform: translateY(100%);
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
