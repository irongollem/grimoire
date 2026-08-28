<template>
  <AppModal :open="!!inv" size="md" @close="emit('close')">
    <template v-if="inv">
      <ModalHeader :title="inv.name" closeable @close="emit('close')">
        <template #actions>
          <AppButton
            v-if="inv.location === 'equipped'"
            variant="link"
            tone="danger"
            size="inline-xs"
            label="Unequip"
            @click="emit('unequip')"
          />
        </template>
      </ModalHeader>

      <!-- Body -->
      <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain p-5 space-y-4">

        <!-- Art: mundane art when unidentified (if present), else identified art -->
        <div
          v-if="displayImageUrl"
          class="w-full rounded-lg overflow-hidden"
          style="aspect-ratio: 2/3; max-height: 50vh"
        >
          <FocalImage
            :src="displayImageUrl!"
            :focal-point="displayImageFocalPoint"
            format="portrait"
            class="h-full"
          />
        </div>

        <!-- Identification status (DM only, magic items) -->
        <div
          v-if="canIdentify && inv && vaultItem && vaultItem.rarity !== 'mundane'"
          class="rounded-lg border p-3 flex items-center justify-between gap-3 transition-colors"
          :class="localIdentified
            ? 'border-border bg-card/50'
            : 'border-amber-500/30 bg-amber-500/5'"
        >
          <div class="flex flex-col gap-0.5">
            <span
              class="text-label-lg font-semibold uppercase"
              :class="localIdentified ? 'text-muted-foreground' : 'text-amber-500/80'"
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

        <!-- Stat block: type / rarity / cost / weight -->
        <ItemStatBlock :item="vaultItem" :is-identified="localIdentified" />

        <!-- Quantity (always shown) -->
        <div class="rounded-lg border border-border bg-card/50 p-3 flex items-center justify-between gap-3">
          <span class="text-label-lg font-semibold text-muted-foreground uppercase">Quantity</span>
          <div class="flex items-center gap-2">
            <AppButton
              variant="subtle"
              fill="muted"
              size="icon-sm"
              :icon="IconMinus"
              :disabled="inv.quantity <= 1"
              @click="adjustQty(-1)"
            />
            <span class="text-heading-sm font-bold text-foreground min-w-8 text-center">{{ inv.quantity }}</span>
            <AppButton
              variant="subtle"
              fill="muted"
              size="icon-sm"
              :icon="IconAdd"
              @click="adjustQty(1)"
            />
          </div>
        </div>

        <!-- Charges (only shown when vault item has charges AND item is identified) -->
        <div v-if="vaultItem?.charges && localIdentified" class="rounded-lg border border-border bg-card/50 p-3 flex flex-col gap-3">
          <div class="flex items-center justify-between">
            <span class="text-label-lg font-semibold text-muted-foreground uppercase">Charges</span>
            <span class="font-cinzel text-sm font-bold text-foreground">
              {{ currentCharges }} / {{ vaultItem.charges }}
            </span>
          </div>

          <!-- Charge pips -->
          <div class="flex flex-wrap gap-1.5">
            <div
              v-for="n in vaultItem.charges"
              :key="n"
              class="h-3 w-3 rounded-full border transition-colors"
              :class="n <= currentCharges ? 'bg-primary border-primary' : 'bg-muted border-border'"
            />
          </div>

          <div class="flex gap-2">
            <AppButton
              variant="subtle"
              size="sm"
              class="flex-1"
              :disabled="currentCharges <= 0 || isUpdating"
              label="Spend Charge"
              @click="spendCharge"
            />
            <AppButton
              v-if="vaultItem.recharge"
              variant="primary"
              size="sm"
              class="flex-1"
              :disabled="currentCharges >= vaultItem.charges || isUpdating"
              label="Recharge"
              @click="recharge"
            />
          </div>

          <p v-if="vaultItem.recharge" class="text-caption text-muted-foreground italic">
            {{ vaultItem.recharge }}
          </p>
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
                <span class="font-cinzel text-2xs text-muted-foreground ml-1.5">{{ spell.level === 0 ? 'Cantrip' : `Lvl ${spell.level}` }}</span>
              </div>
              <!-- Cast button -->
              <AppButton
                variant="tinted"
                tone="primary"
                emphasis="soft"
                size="xs"
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

        <!-- Attunement (hidden until identified) -->
        <div v-if="vaultItem?.requires_attunement && localIdentified" class="rounded-lg border border-border bg-card/50 p-3 flex items-center justify-between gap-3">
          <div class="flex flex-col gap-0.5">
            <span class="text-label-lg font-semibold text-muted-foreground uppercase">Attunement</span>
            <span v-if="vaultItem.attunement_requirements" class="text-caption text-muted-foreground italic">{{ vaultItem.attunement_requirements }}</span>
          </div>
          <!--
            The attuned state hovers red, because pressing it *removes* the
            attunement — the label reads "Attuned ✓", so without that the
            control looks like a status chip rather than the thing that undoes
            it. Overriding the hover tokens on top of the variant, rather than
            re-declaring the box; there is no destructive-on-hover emphasis and
            one state of one button does not warrant inventing one.
          -->
          <AppButton
            :variant="localAttuned ? 'tinted' : 'subtle'"
            :tone="localAttuned ? 'primary' : 'neutral'"
            emphasis="soft"
            size="xs"
            class="shrink-0"
            :class="localAttuned && 'hover:bg-destructive/10 hover:text-destructive hover:border-destructive/40'"
            :disabled="!localAttuned && attunedCount >= 3"
            :tooltip="!localAttuned && attunedCount >= 3 ? 'Maximum 3 attuned items' : undefined"
            :label="localAttuned ? 'Attuned ✓' : (attunedCount >= 3 ? 'Slots Full' : 'Attune')"
            @click="toggleAttunement"
          />
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

        <!-- Notes -->
        <div v-if="inv.notes" class="rounded-lg border border-border bg-card/50 p-3">
          <p class="text-eyebrow font-semibold text-muted-foreground mb-1">Notes</p>
          <p class="text-body text-foreground">{{ inv.notes }}</p>
        </div>

        <!-- Description: mundane when unidentified, full when identified -->
        <div v-if="displayDescription" class="flex flex-col gap-1">
          <p class="text-label-lg font-semibold text-primary uppercase">Description</p>
          <RichTextViewer :content="displayDescription" />
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
            <p class="font-cinzel text-2xs text-amber-400/80 tracking-widest uppercase">List for Sale</p>
            <div class="grid grid-cols-5 gap-1">
              <div v-for="coin in COINS" :key="coin.key" class="flex flex-col items-center gap-0.5">
                <span class="font-cinzel text-2xs font-bold" :class="coin.color">{{ coin.symbol }}</span>
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
    </template>
  </AppModal>
</template>

<script setup lang="ts">
import { computed, ref, reactive, watch } from "vue";
import { storeToRefs } from "pinia";
import { IconAdd, IconHide, IconMinus, IconReveal, IconShop, IconWand } from '@/lib/icons';
import { useQuery } from "@tanstack/vue-query";
import { COINS, type CoinKey, parseCoinText } from "@/rules/currency";
import AppButton from "@/components/common/AppButton.vue";
import AppInput from "@/components/common/AppInput.vue";
import AppModal from "@/components/common/AppModal.vue";
import ModalHeader from "@/components/common/ModalHeader.vue";
import FocalImage from "@/components/common/FocalImage.vue";
import RichTextViewer from "@/components/common/RichTextViewer.vue";
import ItemStatBlock from "@/components/inventory/ItemStatBlock.vue";
import ItemDocumentSection from "@/components/items/ItemDocumentSection.vue";
import { useUpdateInventoryItem } from "@/composables/items/usePartyInventory";
import { useCampaignMessages } from "@/composables/campaign/useCampaignMessages";
import { usePromptedRoll } from "@/composables/dice/usePromptedRoll";
import { useMarkRead } from "@/composables/play/useReadItems";
import { useAuthStore } from "@/stores/auth";
import { useUiStore } from "@/stores/ui";
import { useCampaignStore } from "@/stores/campaign";
import { supabase } from "@/lib/supabase";
import { parseExpression, parsedToCounts } from "@/lib/dice/dice";
import { rollParsed } from "@/lib/dice/roller";
import { SCHOOL_BG } from "@/types/spell.types";
import type { Spell } from "@/types/spell.types";
import type { PartyInventoryItem } from "@/types/inventory.types";
import type { Item } from "@/types/item.types";

const props = defineProps<{
  inv: PartyInventoryItem | null;
  vaultItem: Item | null;
  attunedCount: number;
  canIdentify?: boolean;
}>();

const emit = defineEmits<{
  close: [];
  unequip: [];
  sell: [pp: number, gp: number, ep: number, sp: number, cp: number];
  consume: [id: string]; // scroll fully used up — parent should remove the inventory row
}>();

// ── Written contents + entries ───────────────────────────────────────────────
// This panel is the player surface (mounted only from PlayerInventoryView),
// but the same view also renders for the DM's own real access (canIdentify
// follows the identical `isDM && !dmPreviewMode` gate) and for DM preview —
// mirror ItemSheet.vue's split rather than assuming a single audience.
const auth = useAuthStore();
const ui = useUiStore();
const { activeCampaignId, activeCampaign } = storeToRefs(useCampaignStore());

const isRealDm = computed(() => auth.isDM && !ui.dmPreviewMode);
const dmUserId = computed(() => activeCampaign.value?.user_id ?? null);
const authorPartyMemberId = computed(() =>
  isRealDm.value ? null : (ui.dmPreviewMode ? ui.dmPreviewPartyMemberId : auth.linkedPartyMemberId),
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

const { mutateAsync: updateInventoryItem } = useUpdateInventoryItem();
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
  queryKey: computed(() => ["itemSpells", props.vaultItem?.spell_ids ?? []]),
  queryFn: async () => {
    const ids = props.vaultItem?.spell_ids ?? [];
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
  if (props.vaultItem?.charges) return `Cast — spend 1 charge (${localCharges.value} remaining)`;
  return "Cast (free use)";
});

const isCasting = ref(false);

async function castFromItem(spell: Spell) {
  if (!props.inv || !canCastSpell.value || isCasting.value) return;
  isCasting.value = true;
  try {
    // Flavor message
    await sendFlavorMessage(`casts ${spell.name} from ${props.inv.name}`, "spell");

    // Auto-roll damage
    if (spell.damage_rolls?.length) {
      for (const dmg of spell.damage_rolls) {
        const parsed = parseExpression(dmg.dice);
        if (!parsed) continue;
        const typeLabel = dmg.type ? ` ${dmg.type}` : "";
        const label = `${spell.name} — ${dmg.dice}${typeLabel} damage`;
        const counts = parsedToCounts(parsed.terms);
        if (Object.keys(counts).length === 0) {
          const { total, breakdown } = rollParsed(parsed);
          void sendRoll({ total, label, modifier: parsed.modifier, breakdown, isCrit: false, isFumble: false, isDamage: true });
        } else {
          await promptRoll({ counts, modifier: parsed.modifier, label, isDamage: true });
        }
      }
    }

    // Auto-roll healing
    if (spell.healing_dice) {
      const parsed = parseExpression(spell.healing_dice);
      if (parsed) {
        const label = `${spell.name} — ${spell.healing_dice} healing`;
        const counts = parsedToCounts(parsed.terms);
        if (Object.keys(counts).length === 0) {
          const { total, breakdown } = rollParsed(parsed);
          void sendRoll({ total, label, modifier: parsed.modifier, breakdown, isCrit: false, isFumble: false, isDamage: false });
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
