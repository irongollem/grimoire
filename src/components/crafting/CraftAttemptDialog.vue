<template>
  <AppModal :open="open" size="md" :labelled-by="headingId" :backdrop-dismiss="!result" @close="$emit('close')">
    <!--
      Hand-rolled rather than ModalHeader: the subtitle line carries conditional
      colouring (the "no proficiency" flag goes gold-400) that ModalHeader's
      plain-string `subtitle` prop cannot express. See EventModal.vue for the
      same exception.
    -->
    <header class="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
      <div>
        <h2 :id="headingId" class="text-heading-sm font-bold text-foreground">{{ recipe.name }}</h2>
        <p class="text-caption text-muted-foreground italic">
          {{ discipline.label }} · DC {{ recipe.dc }} ·
          <span class="capitalize">{{ discipline.ability }} check</span>
          <span v-if="hasProficiency && profBonus > 0"> + proficiency</span>
          <span v-else-if="!hasProficiency" class="text-gold-400"> · no proficiency</span>
        </p>
      </div>
      <AppButton
        v-if="!attempting"
        variant="ghost"
        size="icon-xs"
        icon-size="md"
        :icon="IconClose"
        aria-label="Close"
        @click="$emit('close')"
      />
    </header>

    <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4 flex flex-col gap-4">

      <!-- Ingredient slots -->
      <div>
        <p class="text-label-lg font-semibold text-muted-foreground mb-2">INGREDIENTS</p>
        <div class="flex flex-col gap-1.5">
          <div
            v-for="(ing, idx) in ingredientSlots"
            :key="idx"
            class="flex items-center gap-2 rounded-md border px-3 py-2"
            :class="ing.matched ? 'border-elven-green/40 bg-elven-green/5' : 'border-destructive/40 bg-destructive/5'"
          >
            <component :is="ing.matched ? IconCheckCircle : IconCloseCircle" class="h-4 w-4 shrink-0" :class="ing.matched ? 'text-elven-green' : 'text-destructive'" />
            <div class="flex-1 min-w-0">
              <p class="font-cinzel text-xs font-semibold text-foreground truncate" :class="{ italic: !ing.item_id }">{{ ing.itemName }}</p>
              <p class="text-caption-sm text-muted-foreground">Need {{ ing.needed }}×<span v-if="ing.matched"> · Have {{ ing.available }}×</span></p>
            </div>
            <span v-if="idx === 0" class="text-label text-primary shrink-0">PRIMARY</span>
          </div>
        </div>
      </div>

      <!-- No proficiency notice -->
      <div
        v-if="!hasProficiency"
        class="flex items-start gap-2 rounded-md border border-gold-500/40 bg-gold-500/10 px-3 py-2.5"
      >
        <IconWarning class="h-4 w-4 text-gold-400 shrink-0 mt-0.5" />
        <p class="text-caption text-gold-400">
          You don't have <span class="font-semibold">{{ discipline.tools.join(' or ') }}</span> proficiency.
          No proficiency bonus is added to this roll.
        </p>
      </div>

      <!-- Disadvantage notice -->
      <div
        v-if="!hasTools"
        class="flex items-start gap-2 rounded-md border border-gold-500/40 bg-gold-500/10 px-3 py-2.5"
      >
        <IconWarning class="h-4 w-4 text-gold-400 shrink-0 mt-0.5" />
        <p class="text-caption text-gold-400">
          You don't have <span class="font-semibold">{{ discipline.tools.join(' or ') }}</span> in your inventory.
          This roll is made at <span class="font-semibold">disadvantage</span> (roll twice, take lower).
        </p>
      </div>

      <!-- Modifiers: default + recipe-specific -->
      <div v-if="modifiers.length > 0 || workspaceBonus > 0">
        <p class="text-label-lg font-semibold text-muted-foreground mb-2">AVAILABLE MODIFIERS</p>
        <div class="flex flex-col gap-1.5">
          <!-- Standard workspace bonus -->
          <AppCheckbox
            v-if="workspaceBonus > 0"
            v-model="workspaceEnabled"
            label-layout="row"
            :class="['gap-2.5 rounded-md border px-3 py-2 hover:bg-muted/40 transition-colors', workspaceEnabled ? 'border-primary/40 bg-primary/5' : 'border-border']"
          >
            <span>{{ workspaceLabel }}</span>
            <span class="font-cinzel text-xs text-primary font-semibold ml-auto shrink-0">+{{ workspaceBonus }}</span>
          </AppCheckbox>

          <!-- Standard poor-ingredient penalty -->
          <AppCheckbox
            v-model="poorIngredientsEnabled"
            label-layout="row"
            :class="['gap-2.5 rounded-md border px-3 py-2 hover:bg-muted/40 transition-colors', poorIngredientsEnabled ? 'border-destructive/40 bg-destructive/5' : 'border-border']"
          >
            <span>Poor quality ingredients</span>
            <span class="font-cinzel text-xs text-destructive font-semibold ml-auto shrink-0">{{ POOR_INGREDIENTS_PENALTY }}</span>
          </AppCheckbox>

          <!-- Recipe-specific modifiers -->
          <AppCheckbox
            v-for="(mod, idx) in modifiers"
            :key="idx"
            :model-value="selectedModifiers.has(idx)"
            label-layout="row"
            :class="['gap-2.5 rounded-md border px-3 py-2 hover:bg-muted/40 transition-colors', selectedModifiers.has(idx) ? 'border-primary/40 bg-primary/5' : 'border-border']"
            @update:model-value="toggleModifier(idx)"
          >
            <span>{{ mod.description }}</span>
            <span class="font-cinzel text-xs text-primary font-semibold ml-auto shrink-0">+{{ mod.bonus }}</span>
          </AppCheckbox>
        </div>
      </div>

      <!-- Error notice -->
      <div v-if="attemptError" class="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2.5">
        <IconWarning class="h-4 w-4 text-destructive shrink-0 mt-0.5" />
        <p class="text-caption text-destructive">{{ attemptError }}</p>
      </div>

      <!-- Roll result -->
      <div v-if="result" class="rounded-lg border px-4 py-3 text-center"
        :class="{
          'border-elven-green/40 bg-elven-green/10': result.outcome === 'success',
          'border-border bg-muted/30': result.outcome === 'fail',
          'border-destructive/40 bg-destructive/10': result.outcome === 'ruin',
        }"
      >
        <div class="flex items-center justify-center gap-3 mb-1">
          <span class="font-cinzel text-4xl font-black" :class="{
            'text-elven-green': result.outcome === 'success',
            'text-muted-foreground': result.outcome === 'fail',
            'text-destructive': result.outcome === 'ruin',
          }">{{ result.total }}</span>
          <div class="text-left">
            <p class="text-caption text-muted-foreground">
              d20: {{ result.roll }}
              <span v-if="result.hasDisadvantage && result.roll2 !== undefined"> (rolled {{ Math.max(result.roll, result.roll2) }}, took {{ result.roll }})</span>
            </p>
            <p class="text-caption text-muted-foreground">vs DC {{ recipe.dc }}</p>
          </div>
        </div>
        <p class="font-cinzel text-sm font-bold tracking-wide"
          :class="{
            'text-elven-green': result.outcome === 'success',
            'text-muted-foreground': result.outcome === 'fail',
            'text-destructive': result.outcome === 'ruin',
          }"
        >
          {{ outcomeLabel }}
        </p>
        <p class="text-caption text-muted-foreground italic mt-1">{{ outcomeDetail }}</p>
      </div>
    </div>

    <div class="flex justify-end gap-2 px-5 py-4 border-t border-border shrink-0">
      <AppButton
        v-if="!result"
        variant="subtle"
        size="md"
        label="Cancel"
        @click="$emit('close')"
      />
      <AppButton
        v-if="!result"
        variant="primary"
        size="md"
        :icon="IconDiceRoll"
        :label="attempting ? 'Rolling…' : 'Attempt Craft'"
        :disabled="!canAttempt || attempting"
        @click="attempt"
      />
      <AppButton
        v-if="result"
        variant="primary"
        size="md"
        label="Done"
        @click="$emit('done', result)"
      />
    </div>
  </AppModal>
</template>

<script setup lang="ts">
import { ref, computed, useId } from "vue";
import AppButton from "@/components/common/AppButton.vue";
import AppCheckbox from "@/components/common/AppCheckbox.vue";
import AppModal from "@/components/common/AppModal.vue";
import { IconCheckCircle, IconClose, IconCloseCircle, IconDiceRoll, IconWarning } from '@/lib/icons';
import { getDiscipline } from "@/lib/crafting-disciplines";
import { useAttemptCraft } from "@/composables/crafting/useCrafting";
import { useCampaignMessages } from "@/composables/campaign/useCampaignMessages";

import type { CraftingRecipe, CraftingOutput, CraftingModifier, CraftingAttemptResult } from "@/types/crafting.types";
import type { PartyInventoryItem } from "@/types/inventory.types";
import type { Item } from "@/types/item.types";
import type { PartyMember } from "@/types/party.types";

const POOR_INGREDIENTS_PENALTY = -2;

const props = defineProps<{
  open: boolean;
  recipe: CraftingRecipe;
  /** Output items produced on success */
  outputs: CraftingOutput[];
  /** Required ingredients from the recipe definition */
  requiredIngredients: { item_id: string | null; tags: string[] | null; quantity: number }[];
  modifiers: CraftingModifier[];
  /** Player's full inventory (carried items) */
  inventory: PartyInventoryItem[];
  /** All items from vault (for name lookup) */
  allItems: Item[];
  /** output item_id → name, for outputs the player can't read via RLS (#521) */
  outputNameMap?: Map<string, string>;
  member: PartyMember;
  /** Whether the player has the required tool in their inventory */
  hasTools: boolean;
  /** Whether the player has tool proficiency — if false, proficiency bonus is not added */
  hasProficiency: boolean;
  /** Standard bonus for having a proper workspace (per discipline) */
  workspaceBonus: number;
  /** Label for the workspace bonus checkbox */
  workspaceLabel: string;
}>();

defineEmits<{
  close: [];
  done: [result: CraftingAttemptResult];
}>();

const headingId = useId();

const { mutateAsync: attemptCraft } = useAttemptCraft();
const { sendMessage } = useCampaignMessages();

const result = ref<CraftingAttemptResult | null>(null);
const attempting = ref(false);
const attemptError = ref<string | null>(null);
const selectedModifiers = ref<Set<number>>(new Set());
const workspaceEnabled = ref(false);
const poorIngredientsEnabled = ref(false);

const discipline = computed(() => getDiscipline(props.recipe.discipline));

// Ability modifier from character sheet
const abilityMod = computed(() => {
  const score = props.member[discipline.value.ability];
  return Math.floor((score - 10) / 2);
});

const profBonus = computed(() => props.member.proficiency_bonus);
// Only apply proficiency bonus if the player has tool proficiency
const effectiveProfBonus = computed(() => props.hasProficiency ? profBonus.value : 0);

// Match each required ingredient to inventory items
const ingredientSlots = computed(() =>
  props.requiredIngredients.map((req) => {
    let itemName: string;
    let available: number;

    if (req.item_id) {
      itemName = props.allItems.find((i) => i.id === req.item_id)?.name ?? "Unknown item";
      available = props.inventory
        .filter((inv) => inv.item_id === req.item_id && !inv.is_ruined)
        .reduce((sum, inv) => sum + inv.quantity, 0);
    } else {
      // Tag-based: any non-ruined inventory item whose vault item has ALL required tags
      itemName = req.tags!.length === 1
        ? `Any "${req.tags![0]}"`
        : `Any [${req.tags!.join(" + ")}]`;
      available = props.inventory
        .filter((inv) => {
          if (inv.is_ruined) return false;
          const def = props.allItems.find((i) => i.id === inv.item_id);
          return req.tags!.every((t) => def?.tags?.includes(t) ?? false);
        })
        .reduce((sum, inv) => sum + inv.quantity, 0);
    }

    return {
      item_id: req.item_id,
      tags: req.tags,
      itemName,
      needed: req.quantity,
      available,
      matched: available >= req.quantity,
    };
  }),
);

const canAttempt = computed(() =>
  ingredientSlots.value.every((s) => s.matched) && !attempting.value,
);

function toggleModifier(idx: number) {
  if (selectedModifiers.value.has(idx)) {
    selectedModifiers.value.delete(idx);
  } else {
    selectedModifiers.value.add(idx);
  }
  selectedModifiers.value = new Set(selectedModifiers.value);
}

const modifierBonuses = computed(() => {
  const bonuses = [...selectedModifiers.value].map((idx) => props.modifiers[idx].bonus);
  if (workspaceEnabled.value) bonuses.push(props.workspaceBonus);
  if (poorIngredientsEnabled.value) bonuses.push(POOR_INGREDIENTS_PENALTY);
  return bonuses;
});

// Resolve how much of which inventory rows to consume. Each ingredient row is
// consumed by the recipe's required quantity (not the whole stack), and equipped
// or container rows are never eligible — so crafting can't wipe a 20-stack to use
// 2, nor unequip a weapon or dissolve a container.
function resolveIngredientConsumption(): {
  consumption: { id: string; qty: number }[];
  primaryId: string;
  primaryItem: PartyInventoryItem;
} {
  const consumption: { id: string; qty: number }[] = [];
  let primaryId = "";
  let primaryItem: PartyInventoryItem | null = null;

  const eligible = (inv: PartyInventoryItem) =>
    !inv.is_ruined && !inv.is_equipped && !inv.is_container;

  for (const req of props.requiredIngredients) {
    let remaining = req.quantity;
    const matchingItems = req.item_id
      ? props.inventory
          .filter((inv) => inv.item_id === req.item_id && eligible(inv))
          .sort((a, b) => b.quantity - a.quantity)
      : props.inventory
          .filter((inv) => {
            if (!eligible(inv)) return false;
            const def = props.allItems.find((i) => i.id === inv.item_id);
            return req.tags!.every((t) => def?.tags?.includes(t) ?? false);
          })
          .sort((a, b) => b.quantity - a.quantity);

    for (const inv of matchingItems) {
      if (remaining <= 0) break;
      const take = Math.min(remaining, inv.quantity);
      consumption.push({ id: inv.id, qty: take });
      if (!primaryId) {
        primaryId = inv.id;
        primaryItem = inv;
      }
      remaining -= take;
    }
  }

  return { consumption, primaryId, primaryItem: primaryItem! };
}

const outcomeLabel = computed(() => {
  if (!result.value) return "";
  if (result.value.outcome === "success") return "Success!";
  if (result.value.outcome === "ruin") return "Critical Failure — Item Ruined";
  return "Failure";
});

function resolveOutputName(itemId: string): string | undefined {
  return props.allItems.find((i) => i.id === itemId)?.name ?? props.outputNameMap?.get(itemId);
}

const outputNames = computed(() =>
  props.outputs.map((o) => {
    const name = resolveOutputName(o.item_id) ?? "item";
    return o.quantity > 1 ? `${o.quantity}× ${name}` : name;
  }),
);

const outcomeDetail = computed(() => {
  if (!result.value) return "";
  if (result.value.outcome === "success") {
    const list = outputNames.value.join(", ");
    return `${list} added to your backpack.`;
  }
  if (result.value.outcome === "ruin") return "The primary ingredient was ruined and returned to your inventory. Other ingredients were consumed.";
  return "The attempt failed. All ingredients were consumed.";
});

async function attempt() {
  if (!canAttempt.value) return;
  attempting.value = true;
  attemptError.value = null;

  const { consumption, primaryId, primaryItem } = resolveIngredientConsumption();
  const primaryItemDef = props.allItems.find((i) => i.id === primaryItem?.item_id);

  try {
    const resolvedOutputNames: Record<string, string> = {};
    for (const o of props.outputs) {
      if (o.item_id) resolvedOutputNames[o.item_id] = resolveOutputName(o.item_id) ?? "";
    }

    const res = await attemptCraft({
      recipe: props.recipe,
      outputs: props.outputs,
      outputItemNames: resolvedOutputNames,
      ingredientConsumption: consumption,
      primaryIngredientInventoryId: primaryId,
      primaryInventoryItem: {
        item_id: primaryItem.item_id ?? "",
        name: primaryItem.name || primaryItemDef?.name || "Item",
        carried_by: primaryItem.carried_by,
        campaign_id: primaryItem.campaign_id,
      },
      modifierBonuses: modifierBonuses.value,
      abilityMod: abilityMod.value,
      profBonus: effectiveProfBonus.value,
      hasTools: props.hasTools,
      partyMemberId: props.member.id,
    });

    result.value = res;

    // Post to chat
    const modSum = modifierBonuses.value.reduce((a, b) => a + b, 0);
    let msg = `🔨 **${props.member.name}** attempted to craft **${props.recipe.name}** (DC ${props.recipe.dc})`;
    msg += `\nRoll: ${res.roll}${res.hasDisadvantage && res.roll2 !== undefined ? ` (disadvantage: also rolled ${Math.max(res.roll, res.roll2)})` : ""} + ${abilityMod.value} (${discipline.value.ability.toUpperCase()})`;
    if (props.hasProficiency) msg += ` + ${profBonus.value} (prof)`;
    else msg += ` (no proficiency)`;
    if (modSum !== 0) msg += ` ${modSum >= 0 ? "+" : ""}${modSum} (modifiers)`;
    msg += ` = **${res.total}** vs DC ${props.recipe.dc}`;
    if (res.outcome === "success") msg += `\n✅ **Success!** ${outputNames.value.join(", ")} crafted.`;
    else if (res.outcome === "ruin") msg += `\n💀 **Critical failure!** Primary ingredient ruined.`;
    else msg += `\n❌ **Failed.** Ingredients consumed.`;

    sendMessage(msg);
  } catch (err) {
    attemptError.value = err instanceof Error ? err.message : "An unexpected error occurred.";
  } finally {
    attempting.value = false;
  }
}
</script>
