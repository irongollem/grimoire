<template>
  <div
    class="max-w-[90%] rounded-lg border overflow-hidden"
    :class="
      meta.claimed_by_user_id
        ? 'border-border bg-muted/40'
        : 'border-amber-500/30 bg-amber-500/5'
    "
  >
    <div class="px-3 py-2 border-b border-border/50 flex items-center gap-2">
      <IconLoot class="h-3.5 w-3.5 text-amber-400 shrink-0" />
      <span class="text-label text-muted-foreground">
        {{ senderName }} dropped loot
      </span>
    </div>
    <div class="px-3 py-2.5">
      <!-- Optional art object image -->
      <img
        v-if="meta.image_url"
        :src="meta.image_url"
        alt=""
        class="w-full rounded mb-2 object-cover max-h-40"
      />
      <div class="flex items-baseline gap-2 mb-1">
        <span class="font-fell text-sm font-semibold text-foreground">
          {{ meta.quantity > 1 ? `${meta.quantity}× ` : "" }}{{ meta.item_name }}
          <span
            v-if="
              meta.quantity_remaining !== undefined &&
              meta.quantity > 1 &&
              meta.quantity_remaining! < meta.quantity
            "
            class="font-cinzel text-2xs text-amber-400/70 ml-1"
          >({{ meta.quantity_remaining }} left)</span>
        </span>
        <span
          v-if="meta.item_rarity"
          class="font-cinzel text-2xs text-muted-foreground capitalize tracking-wide"
        >
          {{ meta.item_rarity }}
        </span>
      </div>
      <!-- Optional description -->
      <p
        v-if="meta.description"
        class="font-fell text-xs text-muted-foreground/80 italic mb-1.5 leading-snug"
      >{{ meta.description }}</p>
      <!-- Expand details toggle (vault items only) -->
      <button
        v-if="meta.item_id"
        type="button"
        class="flex items-center gap-1 text-label text-muted-foreground hover:text-foreground transition-colors mb-1"
        @click="emit('toggle-details', messageId)"
      >
        <IconChevronDown
          class="h-3 w-3 transition-transform"
          :class="expanded ? 'rotate-180' : ''"
        />
        {{ expanded ? 'Hide Details' : 'Show Details' }}
      </button>
      <ChatItemDropDetails v-if="expanded" :item-id="meta.item_id!" />

      <!-- ── Stacked drop: remaining count + grab buttons ───────── -->
      <template v-if="meta.claims !== undefined">
        <!-- All claimed -->
        <div
          v-if="meta.quantity_remaining === 0"
          class="font-fell text-xs text-muted-foreground italic mt-1"
        >
          All claimed
          <span v-if="meta.claims?.length">
            — by {{ meta.claims!.map(c => c.name).join(', ') }}
          </span>
        </div>
        <!-- Still available -->
        <template v-else>
          <p class="font-cinzel text-2xs text-amber-400/80 mt-1">
            {{ meta.quantity_remaining }} remaining
          </p>
          <div class="flex flex-wrap gap-1.5 mt-1.5">
            <template v-if="linkedPartyMemberId">
              <button
                v-if="meta.quantity! > 1"
                type="button"
                class="px-2.5 py-1 rounded bg-amber-500/20 border border-amber-500/40 text-label text-amber-400 hover:bg-amber-500/30 transition-colors"
                @click="emit('grab', { messageId, qty: 1, intoStash: false })"
              >
                Grab 1
              </button>
              <button
                type="button"
                class="px-2.5 py-1 rounded bg-amber-500/20 border border-amber-500/40 text-label text-amber-400 hover:bg-amber-500/30 transition-colors"
                @click="emit('grab', { messageId, qty: -1, intoStash: false })"
              >
                {{ meta.quantity! > 1 ? 'Grab All' : 'Grab' }}
              </button>
              <button
                type="button"
                class="px-2.5 py-1 rounded border border-border text-label text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors"
                @click="emit('grab', { messageId, qty: -1, intoStash: true })"
              >
                To Stash
              </button>
            </template>
            <div v-if="isDM && npcs.length > 0" class="w-36">
              <EntityCombobox
                :model-value="npcSelectValue"
                :options="npcs"
                placeholder="To NPC…"
                @update:model-value="onClaimToNpc"
              />
            </div>
          </div>
        </template>
      </template>

      <!-- ── Legacy single-claim (messages without claims array) ─── -->
      <template v-else>
        <div
          v-if="meta.claimed_by_user_id"
          class="font-fell text-xs text-muted-foreground italic"
        >
          Claimed by {{ meta.claimed_by_name }}
          <span
            v-if="!meta.claimed_party_member_id && !meta.npc_id"
          >(party stash)</span>
        </div>
        <div v-else class="flex flex-wrap gap-1.5 mt-2">
          <template v-if="linkedPartyMemberId">
            <button
              type="button"
              class="px-2.5 py-1 rounded bg-amber-500/20 border border-amber-500/40 text-label text-amber-400 hover:bg-amber-500/30 transition-colors"
              @click="emit('claim', { messageId, intoStash: false })"
            >
              Claim
            </button>
            <button
              type="button"
              class="px-2.5 py-1 rounded border border-border text-label text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors"
              @click="emit('claim', { messageId, intoStash: true })"
            >
              To Stash
            </button>
          </template>
          <div v-if="isDM && npcs.length > 0" class="w-36">
            <EntityCombobox
              :model-value="npcSelectValue"
              :options="npcs"
              placeholder="To NPC…"
              @update:model-value="onClaimToNpc"
            />
          </div>
        </div>
      </template>
      <p class="font-fell text-2xs text-muted-foreground/50 mt-1.5">
        {{ timeLabel }}
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { IconChevronDown, IconLoot } from '@/lib/icons';
import ChatItemDropDetails from '@/components/chat/ChatItemDropDetails.vue';
import EntityCombobox from '@/components/common/EntityCombobox.vue';
import type { ItemDropMetadata } from '@/types/chat.types';

const {
  messageId,
  meta,
  senderName,
  expanded = false,
  isDM = false,
  linkedPartyMemberId = null,
  npcs = [],
  npcSelectValue = '',
  timeLabel,
} = defineProps<{
  messageId: string;
  meta: ItemDropMetadata;
  senderName: string | null;
  expanded?: boolean;
  isDM?: boolean;
  linkedPartyMemberId?: string | null;
  npcs?: { id: string; name: string }[];
  npcSelectValue?: string;
  timeLabel: string;
}>();

const emit = defineEmits<{
  'toggle-details': [messageId: string];
  claim: [payload: { messageId: string; intoStash: boolean }];
  grab: [payload: { messageId: string; qty: number; intoStash: boolean }];
  'claim-to-npc': [payload: { messageId: string; npcId: string; npcName: string }];
}>();

function onClaimToNpc(npcId: string) {
  if (!npcId) return;
  const npc = npcs.find(n => n.id === npcId);
  if (!npc) return;
  emit('claim-to-npc', { messageId, npcId, npcName: npc.name });
}
</script>
