<template>
  <AppModal :open="!!inv" size="md" @close="emit('close')">
    <template v-if="inv">
      <ModalHeader :title="inv.name" closeable @close="emit('close')" />

      <!-- Body: use first (what it is, what you can do with it), then the rules text,
           then the bookkeeping (stack, notes, selling). The picture is a thumbnail that
           opens the lightbox; on md+ it is a larger column beside everything else. -->
      <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 md:p-5">
        <div
          class="grid gap-x-3 gap-y-4 md:gap-x-5"
          :class="displayImageUrl ? 'grid-cols-[5rem_1fr] md:grid-cols-[11rem_1fr]' : 'grid-cols-1'"
        >
          <!-- Art: mundane art when unidentified (if present), else identified art -->
          <div
            v-if="displayImageUrl"
            class="self-start overflow-hidden rounded-lg border border-border md:row-span-2"
            style="aspect-ratio: 2/3"
          >
            <FocalImage
              :src="displayImageUrl"
              :focal-point="displayImageFocalPoint"
              :alt="`${inv.name}, full size`"
              format="portrait"
              lightbox
              class="h-full"
              ai-badge="right"
            />
          </div>

          <!-- What it is, in one line -->
          <div class="min-w-0 self-center space-y-1">
            <p v-if="summaryLine" class="text-body font-semibold text-foreground">{{ summaryLine }}</p>
            <p v-if="vaultItem?.requires_attunement && localIdentified" class="text-caption text-muted-foreground">
              {{ vaultItem.attunement_requirements ? `Requires attunement ${vaultItem.attunement_requirements}` : "Requires attunement" }}
            </p>
            <p v-if="inv.location === 'equipped'" class="text-caption text-muted-foreground">
              Equipped<span v-if="inv.is_attuned">, attuned</span>
            </p>
            <p v-else-if="inv.is_attuned" class="text-caption text-muted-foreground">Attuned</p>
          </div>

          <div
            class="min-w-0 space-y-4"
            :class="displayImageUrl ? 'col-span-2 md:col-span-1' : ''"
          >
            <!-- Actions: only what applies to this item right now -->
            <div v-if="hasActions" class="space-y-2" aria-label="Item actions" role="group">
              <div class="grid grid-cols-2 gap-2">
                <AppButton
                  v-if="inv.location === 'equipped'"
                  variant="subtle"
                  size="md"
                  label="Unequip"
                  @click="emit('unequip')"
                />
                <AppButton
                  v-else-if="equipOptions.length"
                  variant="primary"
                  size="md"
                  label="Equip"
                  :disabled="freeEquipOptions.length === 0"
                  @click="startEquip"
                />
                <AppButton
                  v-if="canAttune"
                  :variant="localAttuned ? 'subtle' : 'tinted'"
                  :tone="localAttuned ? 'neutral' : 'primary'"
                  emphasis="soft"
                  size="md"
                  :disabled="!localAttuned && attuneFull"
                  :label="localAttuned ? 'End attunement' : 'Attune'"
                  @click="toggleAttunement"
                />
                <AppButton
                  v-if="hasCharges"
                  variant="subtle"
                  size="md"
                  :disabled="currentCharges <= 0 || isUpdating"
                  :label="`Spend a charge (${currentCharges} left)`"
                  @click="spendCharge"
                />
                <AppButton
                  v-if="isConsumable"
                  variant="subtle"
                  size="md"
                  :disabled="isUpdating"
                  label="Consume"
                  @click="consume"
                />
                <AppButton
                  variant="subtle"
                  size="md"
                  label="Drop to chat"
                  @click="emit('dropToChat')"
                />
              </div>

              <!-- A real choice of slot (main or off hand): ask, do not guess -->
              <div v-if="choosingSlot" class="rounded-lg border border-border bg-card/50 p-3 space-y-2">
                <p class="text-caption text-muted-foreground">Equip in which slot?</p>
                <div class="grid grid-cols-2 gap-2">
                  <AppButton
                    v-for="opt in freeEquipOptions"
                    :key="opt.slot"
                    variant="tinted"
                    tone="primary"
                    emphasis="soft"
                    size="md"
                    :label="opt.label"
                    @click="emit('equip', opt.slot)"
                  />
                </div>
              </div>

              <p v-if="equipBlockedHint" class="text-caption text-muted-foreground">{{ equipBlockedHint }}</p>
              <p v-if="attuneBlockedHint" class="text-caption text-muted-foreground">{{ attuneBlockedHint }}</p>
            </div>

            <!-- Spells (shown when item has associated spells and is identified) -->
            <div v-if="itemSpells?.length && localIdentified" class="rounded-lg border border-border bg-card/50 p-3 flex flex-col gap-2">
              <p class="text-eyebrow font-semibold text-muted-foreground">Spells</p>
              <div class="divide-y divide-border">
                <div
                  v-for="spell in itemSpells"
                  :key="spell.id"
                  class="flex items-center gap-2 py-2 first:pt-0 last:pb-0"
                >
                  <!-- School colour dot -->
                  <div class="h-2 w-2 shrink-0 rounded-full" :class="SCHOOL_BG[spell.school]" />
                  <!-- Name + level -->
                  <div class="flex-1 min-w-0">
                    <span class="text-body text-foreground">{{ spell.name }}</span>
                    <span class="text-label text-muted-foreground ml-1.5">{{ spell.level === 0 ? 'Cantrip' : `Lvl ${spell.level}` }}</span>
                  </div>
                  <!-- Cast button -->
                  <AppButton
                    variant="tinted"
                    tone="primary"
                    emphasis="soft"
                    size="md"
                    class="shrink-0"
                    :disabled="!canCastSpell || isCasting"
                    :tooltip="castButtonTitle"
                    label="Cast"
                    :icon="IconWand"
                    icon-size="xs"
                    @click="castFromItem(spell)"
                  />
                </div>
              </div>
            </div>

            <!-- Charges (only shown when vault item has charges AND item is identified).
                 Spending is in the actions row; this is the count and the recharge. -->
            <div v-if="hasCharges" class="rounded-lg border border-border bg-card/50 p-3 flex flex-col gap-3">
              <div class="flex items-center justify-between">
                <span class="text-label-lg font-semibold text-muted-foreground uppercase">Charges</span>
                <span class="text-heading-sm font-bold text-foreground">
                  {{ currentCharges }} / {{ vaultItem?.charges }}
                </span>
              </div>

              <!-- Charge pips -->
              <div class="flex flex-wrap gap-1.5">
                <div
                  v-for="n in vaultItem?.charges"
                  :key="n"
                  class="h-3 w-3 rounded-full border transition-colors"
                  :class="n <= currentCharges ? 'bg-primary border-primary' : 'bg-muted border-border'"
                />
              </div>

              <AppButton
                v-if="vaultItem?.recharge"
                variant="subtle"
                size="md"
                :disabled="currentCharges >= (vaultItem?.charges ?? 0) || isUpdating"
                label="Recharge"
                @click="recharge"
              />

              <p v-if="vaultItem?.recharge" class="text-caption text-muted-foreground italic">
                {{ vaultItem.recharge }}
              </p>
            </div>

            <!-- Stat block: type / rarity / cost / weight -->
            <ItemStatBlock :item="vaultItem" :is-identified="localIdentified" omit-summary-rows />

            <!-- Description: mundane when unidentified, full when identified -->
            <div v-if="displayDescription" class="flex flex-col gap-1">
              <p class="text-label-lg font-semibold text-primary uppercase">Description</p>
              <RichTextViewer :content="displayDescription" />
            </div>

            <!-- Bundle contents (packs only) -->
            <div
              v-if="vaultItem?.bundle_items?.length"
              class="rounded-lg border border-border bg-card/50 p-3 flex flex-col gap-2"
            >
              <p class="text-eyebrow font-semibold text-muted-foreground">Contents</p>
              <ul class="space-y-0.5">
                <li
                  v-for="(entry, i) in vaultItem.bundle_items"
                  :key="i"
                  class="text-body text-foreground flex items-baseline gap-1.5"
                >
                  <span class="text-muted-foreground text-xs shrink-0">×{{ entry.quantity ?? 1 }}</span>
                  {{ entry.name }}
                </li>
              </ul>
            </div>

            <!-- Written contents + player entries. `vaultItem.content` is already
                 nulled by the get_player_visible_items projection while
                 unidentified, so ItemDocumentSection naturally renders nothing
                 extra — no separate identified gate needed here. -->
            <ItemDocumentSection
              v-if="vaultItem"
              :item="vaultItem"
              :campaign-id="activeCampaignId"
              :can-write-entries="canWriteEntries"
              :author-party-member-id="authorPartyMemberId"
              :can-moderate="canModerate"
              :dm-user-id="dmUserId"
            />

            <!-- Curse (DM sees it always with reveal toggle; players only see it when revealed) -->
            <div
              v-if="vaultItem?.curse_description && (canIdentify || inv?.curse_revealed)"
              class="rounded-lg border border-destructive/30 bg-destructive/5 p-3 flex flex-col gap-2"
            >
              <div class="flex items-center justify-between gap-2">
                <p class="text-label-lg font-semibold text-destructive uppercase">Curse</p>
                <AppButton
                  v-if="canIdentify && inv"
                  :variant="inv.curse_revealed ? 'tinted' : 'subtle'"
                  tone="caution"
                  emphasis="outline"
                  size="xs"
                  :disabled="isTogglingCurse"
                  @click="toggleCurseReveal"
                >
                  <template #icon>
                    <IconReveal v-if="inv.curse_revealed" class="h-3 w-3" />
                    <IconHide v-else class="h-3 w-3" />
                  </template>
                  {{ inv.curse_revealed ? 'Revealed to players' : 'Hidden from players' }}
                </AppButton>
              </div>
              <RichTextViewer :content="vaultItem.curse_description" />
            </div>

            <!-- Identification status (DM only, magic items) -->
            <div
              v-if="canIdentify && inv && vaultItem && vaultItem.rarity !== 'mundane'"
              class="rounded-lg border p-3 flex items-center justify-between gap-3 transition-colors"
              :class="localIdentified
                ? 'border-border bg-card/50'
                : 'border-tone-caution/30 bg-tone-caution/5'"
            >
              <div class="flex flex-col gap-0.5">
                <span
                  class="text-label-lg font-semibold uppercase"
                  :class="localIdentified ? 'text-muted-foreground' : 'text-ink-caution/80'"
                >{{ localIdentified ? 'Identified' : 'Unidentified' }}</span>
                <span class="text-caption text-muted-foreground italic">
                  {{ localIdentified ? 'Players see the full description' : 'Players see only the mundane description' }}
                </span>
              </div>
              <AppButton
                :variant="localIdentified ? 'subtle' : 'tinted'"
                tone="caution"
                emphasis="outline"
                fill="tone"
                size="xs"
                class="shrink-0"
                :label="localIdentified ? 'Unidentify' : 'Identify'"
                @click="toggleIdentified"
              />
            </div>

            <!-- Quantity (always shown) -->
            <div class="rounded-lg border border-border bg-card/50 p-3 flex items-center justify-between gap-3">
              <span class="text-label-lg font-semibold text-muted-foreground uppercase">Quantity</span>
              <div class="flex items-center gap-2">
                <AppButton
                  variant="subtle"
                  fill="muted"
                  size="icon-sm"
                  :icon="IconMinus"
                  aria-label="One fewer"
                  :disabled="inv.quantity <= 1"
                  @click="adjustQty(-1)"
                />
                <span class="text-heading-sm font-bold text-foreground min-w-8 text-center">{{ inv.quantity }}</span>
                <AppButton
                  variant="subtle"
                  fill="muted"
                  size="icon-sm"
                  :icon="IconAdd"
                  aria-label="One more"
                  @click="adjustQty(1)"
                />
              </div>
            </div>

            <!-- Notes: shared per-instance text — the player's own reminder
                 ("special qualities"), visible to whoever holds the item — #809 -->
            <div class="rounded-lg border border-border bg-card/50 p-3">
              <p class="text-eyebrow font-semibold text-muted-foreground mb-1">Notes</p>
              <AppButton
                v-if="!editingNotes && !localNotes"
                variant="subtle"
                size="sm"
                label="Add a note"
                @click="startEditingNotes"
              />
              <div v-else-if="editingNotes" class="flex flex-col gap-2">
                <RichTextEditor v-model="draftNotes" size="sm" placeholder="Special qualities, reminders…" />
                <div class="flex gap-2">
                  <AppButton variant="primary" size="xs" label="Save" @click="saveNotes" />
                  <AppButton variant="subtle" size="xs" label="Cancel" @click="cancelEditingNotes" />
                </div>
              </div>
              <div v-else class="flex flex-col gap-2">
                <RichTextViewer :content="localNotes" />
                <AppButton variant="subtle" size="sm" label="Edit" class="self-start" @click="startEditingNotes" />
              </div>
            </div>

            <!-- Sell form -->
            <div class="border-t border-border pt-4">
              <AppButton
                v-if="!sellOpen"
                variant="ghost"
                size="inline-xs"
                :icon="IconShop"
                label="List for Sale"
                @click="openSell"
              />
              <div v-else class="space-y-2">
                <p class="text-eyebrow text-ink-caution/80 ">List for Sale</p>
                <div class="grid grid-cols-5 gap-1">
                  <div v-for="coin in COINS" :key="coin.key" class="flex flex-col items-center gap-0.5">
                    <span class="text-label font-bold" :class="coin.color">{{ coin.symbol }}</span>
                    <AppInput
                      v-model.number="sellPrice[coin.key]"
                      type="number" min="0"
                      tone="muted"
                      size="xs"
                      align="center"
                    />
                  </div>
                </div>
                <div class="flex gap-2">
                  <AppButton
                    variant="primary"
                    size="xs"
                    class="flex-1"
                    :disabled="!sellHasPrice"
                    label="Post to Chat"
                    @click="confirmSell"
                  />
                  <AppButton variant="subtle" size="xs" label="Cancel" @click="sellOpen = false" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>
  </AppModal>
</template>

<script setup lang="ts">
import { computed, ref, reactive, watch } from "vue";
import { storeToRefs } from "pinia";
import { IconAdd, IconHide, IconMinus, IconReveal, IconShop, IconWand } from '@/lib/icons';
import { useQuery } from "@tanstack/vue-query";
import { COINS, type CoinKey, parseCoinText } from "@/rules/currency";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import AppModal from "@/components/common/overlays/AppModal.vue";
import ModalHeader from "@/components/common/overlays/ModalHeader.vue";
import FocalImage from "@/components/common/media/FocalImage.vue";
import RichTextViewer from "@/components/common/richtext/RichTextViewer.vue";
import RichTextEditor from "@/components/common/richtext/RichTextEditor.vue";
import ItemStatBlock from "@/components/inventory/ItemStatBlock.vue";
import { itemSummaryLine, type EquipOption } from "@/components/inventory/itemDetailSummary";
import ItemDocumentSection from "@/components/items/ItemDocumentSection.vue";
import { tiptapToPlainText } from "@/lib/tiptap/tiptapText";
import { useUpdateInventoryItem } from "@/composables/items/usePartyInventory";
import { useToast } from "@/composables/useToast";
import { useCampaignMessages } from "@/composables/campaign/useCampaignMessages";
import { useChatSendFailure } from "@/composables/campaign/chatSendErrors";
import { usePromptedRoll } from "@/composables/dice/usePromptedRoll";
import { useMarkRead } from "@/composables/player/useReadItems";
import { useAuthStore } from "@/stores/auth";
import { useAppUiStore } from "@/stores/ui/app";
import { useCampaignStore } from "@/stores/campaign";
import { supabase } from "@/lib/supabase";
import { parseExpression, parsedToCounts } from "@/lib/dice/dice";
import { rollParsed } from "@/lib/dice/roller";
import { SCHOOL_BG } from "@/types/spell.types";
import type { Spell } from "@/types/spell.types";
import type { InventorySlot, PartyInventoryItem } from "@/types/inventory.types";
import type { Item } from "@/types/item.types";

const props = defineProps<{
  inv: PartyInventoryItem | null;
  vaultItem: Item | null;
  attunedCount: number;
  canIdentify?: boolean;
  /** Slots this item can go in, from the parent that knows what is worn. Empty = it cannot be equipped. */
  equipOptions: EquipOption[];
}>();

const emit = defineEmits<{
  close: [];
  unequip: [];
  equip: [slot: InventorySlot];
  dropToChat: [];
  sell: [pp: number, gp: number, ep: number, sp: number, cp: number];
  consume: [id: string]; // scroll fully used up — parent should remove the inventory row
}>();

// ── Written contents + entries ───────────────────────────────────────────────
// This panel is the player surface (mounted only from PlayerInventoryView),
// but the same view also renders for the DM's own real access (canIdentify
// follows the identical `isDM && !dmPreviewMode` gate) and for DM preview —
// mirror ItemSheet.vue's split rather than assuming a single audience.
const auth = useAuthStore();
const appUi = useAppUiStore();
const { activeCampaignId, activeCampaign } = storeToRefs(useCampaignStore());

const isRealDm = computed(() => auth.isDM && !appUi.dmPreviewMode);
const dmUserId = computed(() => activeCampaign.value?.user_id ?? null);
const authorPartyMemberId = computed(() =>
  isRealDm.value ? null : (appUi.dmPreviewMode ? appUi.dmPreviewPartyMemberId : auth.linkedPartyMemberId),
);
const canWriteEntries = computed(() => isRealDm.value || (props.vaultItem?.content_player_writable ?? false));
const canModerate = computed(() => isRealDm.value);

const { mutate: markRead } = useMarkRead();
// Mark the tome read whenever the panel opens on an item that has content —
// mirrors PlayerLocationDialog.vue's open-marks-read idiom.
watch(
  () => props.inv?.id,
  (id) => {
    if (id && props.vaultItem && props.vaultItem.content !== null) {
      markRead({ entityType: "item_document", entityId: props.vaultItem.id });
    }
  },
);

const MAX_ATTUNED = 3;

const sellOpen  = ref(false);
const sellPrice = reactive<Record<CoinKey, number>>({ pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 });
const sellHasPrice = computed(() => COINS.some(c => sellPrice[c.key] > 0));

function openSell() {
  const parsed = props.vaultItem?.cost ? parseCoinText(props.vaultItem.cost) : null;
  COINS.forEach(c => { sellPrice[c.key] = parsed?.[c.key] ?? 0; });
  sellOpen.value = true;
}

function confirmSell() {
  if (!sellHasPrice.value) return;
  emit('sell', sellPrice.pp, sellPrice.gp, sellPrice.ep, sellPrice.sp, sellPrice.cp);
  sellOpen.value = false;
}

// Reset sell form when panel closes
watch(() => props.inv, () => { sellOpen.value = false; });

const { mutateAsync: updateInventoryItemRaw } = useUpdateInventoryItem();
const toast = useToast();

/** Save an inventory edit; a rejected write becomes a toast instead of an unhandled rejection. */
async function updateInventoryItem(args: Parameters<typeof updateInventoryItemRaw>[0]) {
  try {
    await updateInventoryItemRaw(args);
  } catch (error) {
    toast.error(toast.fromError(error, "Couldn't save that change."));
  }
}
const isUpdating = ref(false);

const isTogglingCurse = ref(false);
async function toggleCurseReveal() {
  if (!props.inv) return;
  isTogglingCurse.value = true;
  try {
    await updateInventoryItem({ id: props.inv.id, update: { curse_revealed: !props.inv.curse_revealed } });
  } finally {
    isTogglingCurse.value = false;
  }
}

const displayImageUrl = computed(() =>
  localIdentified.value
    ? props.vaultItem?.image_url
    : (props.vaultItem?.mundane_image_url || props.vaultItem?.image_url)
);

const displayImageFocalPoint = computed(() =>
  localIdentified.value
    ? props.vaultItem?.image_focal_point
    : (props.vaultItem?.mundane_image_focal_point || props.vaultItem?.image_focal_point)
);

const displayDescription = computed(() =>
  localIdentified.value
    ? (props.vaultItem?.description ?? null)
    : (props.vaultItem?.mundane_description ?? null)
);

// Local optimistic charge count — avoids stale reads on rapid clicks before refetch
const localCharges = ref(0);
const localAttuned = ref(false);
const localIdentified = ref(true);

function syncCharges() {
  if (!props.vaultItem?.charges) { localCharges.value = 0; return; }
  localCharges.value = props.inv?.current_charges ?? props.vaultItem.charges;
}

// Sync when panel opens on a new item, or when the server value arrives after refetch
watch(() => [props.inv?.id, props.inv?.current_charges] as const, syncCharges, { immediate: true });
watch(() => [props.inv?.id, props.inv?.is_attuned] as const, () => {
  localAttuned.value = props.inv?.is_attuned ?? false;
}, { immediate: true });
watch(() => [props.inv?.id, props.inv?.is_identified] as const, () => {
  localIdentified.value = props.inv?.is_identified ?? true;
}, { immediate: true });

// Notes: local optimistic ref synced from props via watch — same idiom as
// localCharges/localAttuned/localIdentified above (#809).
const localNotes = ref<string | null>(null);
const editingNotes = ref(false);
const draftNotes = ref<string | null>(null);

watch(() => [props.inv?.id, props.inv?.notes] as const, () => {
  localNotes.value = props.inv?.notes ?? null;
  editingNotes.value = false;
}, { immediate: true });

function startEditingNotes() {
  draftNotes.value = localNotes.value;
  editingNotes.value = true;
}

function cancelEditingNotes() {
  editingNotes.value = false;
}

async function saveNotes() {
  if (!props.inv) return;
  const next = tiptapToPlainText(draftNotes.value).trim() ? draftNotes.value : null;
  localNotes.value = next;
  editingNotes.value = false;
  await updateInventoryItem({ id: props.inv.id, update: { notes: next } });
}

async function toggleIdentified() {
  if (!props.inv) return;
  localIdentified.value = !localIdentified.value;
  await updateInventoryItem({ id: props.inv.id, update: { is_identified: localIdentified.value } });
}

const currentCharges = computed(() => localCharges.value);

async function toggleAttunement() {
  if (!props.inv) return;
  localAttuned.value = !localAttuned.value;
  await updateInventoryItem({ id: props.inv.id, update: { is_attuned: localAttuned.value } });
}

// ── Actions row ───────────────────────────────────────────────────────────────
// What the player can do with this item right now. Each flag mirrors the gate the
// old card carried (attune and charges stay hidden until identified), so the
// unidentified masking is unchanged: no true type, rarity, text or attune.
const summaryLine = computed(() => itemSummaryLine(props.vaultItem, localIdentified.value));
const hasActions = computed(() => !!props.inv);
const hasCharges = computed(() => !!props.vaultItem?.charges && localIdentified.value);
const canAttune = computed(() => !!props.vaultItem?.requires_attunement && localIdentified.value);
const attuneFull = computed(() => props.attunedCount >= MAX_ATTUNED);
const attuneBlockedHint = computed(() =>
  canAttune.value && !localAttuned.value && attuneFull.value
    ? `You're attuned to ${MAX_ATTUNED} items, the most you can have. End one attunement to attune to this.`
    : null,
);
const isConsumable = computed(() => {
  const type = props.vaultItem?.item_type;
  return type === "potion" || type === "provision";
});

const freeEquipOptions = computed(() => props.equipOptions.filter((o) => o.free));
const choosingSlot = ref(false);
watch(() => props.inv?.id, () => { choosingSlot.value = false; });
const equipBlockedHint = computed(() => {
  if (props.inv?.location === "equipped" || !props.equipOptions.length || freeEquipOptions.value.length) return null;
  // An unidentified item must not name the slot it belongs in: that gives its type away.
  if (!localIdentified.value) return "The slot for this is taken. Unequip what's there first.";
  const names = props.equipOptions.map((o) => o.label.toLowerCase());
  return `Your ${names.join(" and ")} ${names.length > 1 ? "are" : "is"} taken. Unequip what's there first.`;
});

function startEquip() {
  const free = freeEquipOptions.value;
  if (free.length === 1) emit("equip", free[0]!.slot);
  else if (free.length > 1) choosingSlot.value = true;
}

/** Use up one of a stack (a potion, a ration); the last one removes the row. */
async function consume() {
  if (!props.inv) return;
  if (props.inv.quantity <= 1) {
    emit("consume", props.inv.id);
    return;
  }
  isUpdating.value = true;
  try {
    await updateInventoryItem({ id: props.inv.id, update: { quantity: props.inv.quantity - 1 } });
  } finally {
    isUpdating.value = false;
  }
}

async function adjustQty(delta: number) {
  if (!props.inv) return;
  const next = Math.max(1, props.inv.quantity + delta);
  await updateInventoryItem({ id: props.inv.id, update: { quantity: next } });
}

async function spendCharge() {
  if (!props.inv || !props.vaultItem?.charges) return;
  isUpdating.value = true;
  try {
    const next = Math.max(0, localCharges.value - 1);
    localCharges.value = next; // optimistic update — renders immediately
    await updateInventoryItem({ id: props.inv.id, update: { current_charges: next } });
  } finally {
    isUpdating.value = false;
  }
}

async function recharge() {
  if (!props.inv || !props.vaultItem?.charges) return;
  isUpdating.value = true;
  try {
    localCharges.value = props.vaultItem.charges; // optimistic update
    await updateInventoryItem({ id: props.inv.id, update: { current_charges: props.vaultItem.charges } });
  } finally {
    isUpdating.value = false;
  }
}

// ── Item spells ───────────────────────────────────────────────────────────────

const { data: itemSpells } = useQuery({
  queryKey: computed(() => ["itemSpells", props.vaultItem?.spell_ids ?? []] as const),
  queryFn: async ({ queryKey: [, ids] }) => {
    if (!ids.length) return [] as Spell[];
    const { data, error } = await supabase
      .from("spells")
      .select("*")
      .in("id", ids)
      .order("level")
      .order("name");
    if (error) throw error;
    return data as Spell[];
  },
  enabled: computed(() => (props.vaultItem?.spell_ids?.length ?? 0) > 0 && localIdentified.value),
});

const { sendFlavorMessage, sendRoll } = useCampaignMessages();
const { reportChatFailure } = useChatSendFailure();
const { promptRoll } = usePromptedRoll();

const isScrollType = computed(() => props.vaultItem?.item_type === "scroll");

/** Cast is possible when there is a carrier and enough charges / uses remaining. */
const canCastSpell = computed(() => {
  if (!props.inv?.carried_by) return false;
  if (isScrollType.value) return props.inv.quantity > 0;
  if (props.vaultItem?.charges) return localCharges.value > 0;
  return true; // free cast (ring cantrip, etc.)
});

const castButtonTitle = computed(() => {
  if (!props.inv?.carried_by) return "No carrier assigned";
  if (isScrollType.value && props.inv.quantity <= 0) return "Scroll consumed";
  if (props.vaultItem?.charges && localCharges.value <= 0) return "No charges remaining";
  if (isScrollType.value) return "Cast and consume scroll";
  if (props.vaultItem?.charges) return `Cast · spend 1 charge (${localCharges.value} remaining)`;
  return "Cast (free use)";
});

const isCasting = ref(false);

async function castFromItem(spell: Spell) {
  if (!props.inv || !canCastSpell.value || isCasting.value) return;
  isCasting.value = true;
  try {
    // Flavor message
    await sendFlavorMessage(`casts ${spell.name} from ${props.inv.name}`, "spell").catch((e) => reportChatFailure(e, "announce the cast in the chat"));

    // Auto-roll damage
    if (spell.damage_rolls?.length) {
      for (const dmg of spell.damage_rolls) {
        const parsed = parseExpression(dmg.dice);
        if (!parsed) continue;
        const typeLabel = dmg.type ? ` ${dmg.type}` : "";
        const label = `${spell.name} · ${dmg.dice}${typeLabel} damage`;
        const counts = parsedToCounts(parsed.terms);
        if (Object.keys(counts).length === 0) {
          const { total, breakdown } = rollParsed(parsed);
          sendRoll({ total, label, modifier: parsed.modifier, breakdown, isCrit: false, isFumble: false, isDamage: true }).catch((e) => reportChatFailure(e, "post the roll to the chat"));
        } else {
          await promptRoll({ counts, modifier: parsed.modifier, label, isDamage: true });
        }
      }
    }

    // Auto-roll healing
    if (spell.healing_dice) {
      const parsed = parseExpression(spell.healing_dice);
      if (parsed) {
        const label = `${spell.name} · ${spell.healing_dice} healing`;
        const counts = parsedToCounts(parsed.terms);
        if (Object.keys(counts).length === 0) {
          const { total, breakdown } = rollParsed(parsed);
          sendRoll({ total, label, modifier: parsed.modifier, breakdown, isCrit: false, isFumble: false, isDamage: false }).catch((e) => reportChatFailure(e, "post the roll to the chat"));
        } else {
          await promptRoll({ counts, modifier: parsed.modifier, label, isDamage: false });
        }
      }
    }

    // Consume: scroll = remove/decrement qty; charged item = spend 1 charge
    if (isScrollType.value) {
      if (props.inv.quantity <= 1) {
        emit("consume", props.inv.id); // parent removes the row
      } else {
        await updateInventoryItem({ id: props.inv.id, update: { quantity: props.inv.quantity - 1 } });
      }
    } else if (props.vaultItem?.charges) {
      const next = Math.max(0, localCharges.value - 1);
      localCharges.value = next; // optimistic
      await updateInventoryItem({ id: props.inv.id, update: { current_charges: next } });
    }
  } finally {
    isCasting.value = false;
  }
}

defineExpose({ openSell });
</script>
