<template>
  <div class="rounded-lg border border-border bg-card overflow-hidden">
    <div class="px-4 py-2.5 border-b border-border">
      <p class="text-label-lg font-semibold">Wild Resurgence</p>
    </div>
    <div class="space-y-3 p-3">
      <div class="space-y-1.5">
        <p class="text-label text-muted-foreground">Regain a use</p>
        <template v-if="noUsesLeft">
          <PlayerWildShapeSlotTrade
            v-if="spendableSlots.length"
            :slots="spendableSlots"
            button-label="Spend a slot"
            :disabled="!canManage"
            :pending="pending"
            @trade="(slot) => trade('slot_for_use', slot)"
          />
          <p v-else class="text-caption text-muted-foreground italic">You have no spell slot to spend.</p>
        </template>
        <p v-else class="text-caption text-muted-foreground italic">
          With no uses left, spend a spell slot to regain one.
        </p>
      </div>

      <div class="space-y-1.5">
        <p class="text-label text-muted-foreground">Turn a use into a level 1 slot</p>
        <div class="flex items-center gap-2">
          <AppButton
            variant="tinted"
            size="sm"
            tone="arcane"
            emphasis="soft"
            label="Regain a level 1 slot"
            :disabled="!canManage || !canTurnUseIntoSlot"
            :loading="pending"
            @click="expendedLevelOne && trade('use_for_slot', expendedLevelOne)"
          />
          <p class="text-caption text-muted-foreground italic">
            {{ slotTaken ? "Used. This returns after a long rest." : expendedLevelOne ? "Once per long rest." : "Needs an expended level 1 slot." }}
          </p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import AppButton from "@/components/common/AppButton.vue";
import PlayerWildShapeSlotTrade from "@/components/player/PlayerWildShapeSlotTrade.vue";
import { useWildShapeExchange, type WildShapeExchangeAction } from "@/composables/play/useWildShapeExchange";
import { useToast } from "@/composables/useToast";
import { slotPool } from "@/rules/spellSlots";
import type { WildShapeRules } from "@/rules/wildshape";
import type { PartyMember, SpellSlotEntry } from "@/types/party.types";

// 2024 Wild Resurgence (druid level 5): trade a spell slot for a Wild Shape use
// when none are left, or, once per long rest, a use for a level 1 slot.
const { member, rules, slots, canManage } = defineProps<{
  member: PartyMember;
  rules: WildShapeRules;
  /** The character's effective spell slots, which the server spends from when none are stored yet. */
  slots: SpellSlotEntry[];
  canManage: boolean;
}>();

const toast = useToast();
const { mutateAsync, isPending: pending } = useWildShapeExchange();

const used = computed(() => member.wildshapes_used ?? 0);
const noUsesLeft = computed(() => rules.maxUses !== null && used.value >= rules.maxUses);
const usesLeft = computed(() => rules.maxUses === null || used.value < rules.maxUses);
const spendableSlots = computed(() => slots.filter((slot) => slot.used < slot.max));
const slotTaken = computed(() => member.class_choices?.wild_resurgence_slot_taken === true);
// The restored slot is a level 1 spell slot specifically, never a Pact or created one.
const expendedLevelOne = computed(
  () => slots.find((slot) => slot.level === 1 && slotPool(slot) === "spellcasting" && slot.used > 0) ?? null,
);
const canTurnUseIntoSlot = computed(() => usesLeft.value && !slotTaken.value && expendedLevelOne.value !== null);

async function trade(action: WildShapeExchangeAction, slot: SpellSlotEntry) {
  try {
    await mutateAsync({
      partyMemberId: member.id,
      action,
      slotLevel: slot.level,
      slotPool: slotPool(slot),
      slotTemplate: slots,
    });
    toast.success(action === "slot_for_use" ? "Regained a Wild Shape use." : "Regained a level 1 spell slot.");
  } catch (error) {
    toast.error(toast.fromError(error));
  }
}
</script>
