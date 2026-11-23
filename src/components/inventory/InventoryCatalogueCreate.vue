<template>
  <form class="space-y-3" @submit.prevent="submit">
    <label v-if="mode === 'manual'" class="block space-y-1">
      <span class="text-caption text-muted-foreground">Item name</span>
      <AppInput v-model="itemName" required tone="default" size="body" :disabled="busy || pending !== null" />
    </label>
    <div v-if="mode === 'manual'" class="grid grid-cols-2 gap-3">
      <label class="block space-y-1">
        <span class="text-caption text-muted-foreground">Item type</span>
        <AppSelect v-model="itemType" tone="filled" size="body" weight="normal" block :disabled="busy || pending !== null">
          <option v-for="type in ITEM_TYPES" :key="type" :value="type">{{ ITEM_TYPE_LABELS[type] }}</option>
        </AppSelect>
      </label>
      <label class="block space-y-1">
        <span class="text-caption text-muted-foreground">Rarity</span>
        <AppSelect v-model="rarity" tone="filled" size="body" weight="normal" block :disabled="busy || pending !== null">
          <option v-for="value in ITEM_RARITIES" :key="value" :value="value">{{ ITEM_RARITY_LABELS[value] }}</option>
        </AppSelect>
      </label>
    </div>
    <div v-if="mode === 'manual'" class="grid grid-cols-2 gap-3">
      <label class="block space-y-1">
        <span class="text-caption text-muted-foreground">Weight (lb)</span>
        <AppInput v-model.number="weight" type="number" min="0" step="any" tone="default" size="body" :disabled="busy" />
      </label>
      <label v-if="isArmorType(itemType)" class="block space-y-1">
        <span class="text-caption text-muted-foreground">Armor class</span>
        <AppInput v-model="armorClass" tone="default" size="body" placeholder="e.g. 12 + DEX" :disabled="busy" />
      </label>
      <template v-if="isWeaponType(itemType)">
        <label class="block space-y-1">
          <span class="text-caption text-muted-foreground">Damage dice</span>
          <AppInput v-model="damageDice" tone="default" size="body" placeholder="e.g. 1d8" :disabled="busy" />
        </label>
        <label class="block space-y-1">
          <span class="text-caption text-muted-foreground">Damage type</span>
          <AppSelect v-model="damageType" tone="filled" size="body" weight="normal" block :disabled="busy">
            <option v-for="type in DAMAGE_TYPES" :key="type" :value="type">{{ type }}</option>
          </AppSelect>
        </label>
      </template>
    </div>
    <label v-if="mode === 'ai'" class="block space-y-1">
      <span class="text-caption text-muted-foreground">Describe the item</span>
      <textarea
        v-model="concept"
        class="min-h-20 w-full rounded-md border border-border bg-muted px-3 py-2 text-body text-foreground"
        :maxlength="AI_PROMPT_LIMIT"
        required
        :disabled="busy || pending !== null"
      />
    </label>
    <div v-else class="space-y-1" :inert="busy">
      <p class="text-caption text-muted-foreground">Description</p>
      <RichTextEditor v-model="description" size="sm" placeholder="Describe this item…" />
    </div>
    <label v-if="mode === 'ai'" class="flex items-center justify-between gap-3 text-caption">
      <span>Generate item art (extra credits may apply)</span>
      <ToggleSwitch v-model="generateImage" aria-label="Generate item art" :disabled="busy || pending !== null" />
    </label>
    <p v-if="error" role="alert" class="text-caption text-destructive">{{ error }}</p>
    <div class="flex flex-wrap justify-end gap-2">
      <AppButton variant="subtle" size="md" label="Back" :disabled="busy" @click="emit('cancel')" />
      <AppButton
        type="submit"
        variant="primary"
        size="md"
        :label="buttonLabel"
        :disabled="busy || !ready"
      />
    </div>
  </form>
</template>

<script setup lang="ts">
import { computed, ref, shallowRef } from "vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import AppSelect from "@/components/common/controls/AppSelect.vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import ToggleSwitch from "@/components/common/controls/ToggleSwitch.vue";
import RichTextEditor from "@/components/common/richtext/RichTextEditor.vue";
import { useCreateItem } from "@/composables/items/useItems";
import { useCampaignStore } from "@/stores/campaign";
import { useAiCredits } from "@/composables/ai/useAiCredits";
import { useOutOfCredits } from "@/composables/ai/useOutOfCredits";
import { useCampaignProviders } from "@/composables/ai/useCampaignProviders";
import { useItemGeneration } from "@/ai/useItemGeneration";
import { AI_PROMPT_LIMIT } from "@/ai/utils";
import { generatedItemPayload } from "@/lib/items/generatedItemPayload";
import { tiptapToPlainText } from "@/lib/tiptap/tiptapText";
import { DAMAGE_TYPES, type DamageType } from "@/types/damage.types";
import { parseExpression } from "@/lib/dice/dice";
import { ITEM_TYPES, ITEM_TYPE_LABELS, ITEM_RARITIES, ITEM_RARITY_LABELS, isArmorType, isWeaponType, type Item, type ItemInsert, type ItemRarity, type ItemType } from "@/types/item.types";

const props = defineProps<{ mode: "manual" | "ai"; name: string; notes: string | null; campaignId: string }>();
const emit = defineEmits<{ created: [item: Item]; cancel: []; busy: [active: boolean] }>();
const campaign = useCampaignStore();
const { mutateAsync: createItem } = useCreateItem();
const { generate, error: generatorError } = useItemGeneration();
const { costOf } = useAiCredits();
const { requireCredits } = useOutOfCredits();
const { textCredits, textIsByok } = useCampaignProviders();
const textCost = computed(() => textCredits(costOf("item_generation")));

const itemName = ref(props.name);
const itemType = ref<ItemType>("gear");
const rarity = ref<ItemRarity>("mundane");
const weight = ref<number | null>(null);
const armorClass = ref("");
const damageDice = ref("");
const damageType = ref<DamageType>("bludgeoning");
const description = ref("");
const concept = ref([props.name, tiptapToPlainText(props.notes)].filter(Boolean).join("\n\n").slice(0, AI_PROMPT_LIMIT));
const generateImage = ref(false);
const busy = ref(false);
const pending = shallowRef<ItemInsert | null>(null);
const error = ref<string | null>(null);
const ready = computed(() => pending.value !== null || (props.mode === "manual"
  ? itemName.value.trim().length > 0
  : concept.value.trim().length > 0 && campaign.isAiEnabled && (textIsByok.value || textCost.value !== null)));
const buttonLabel = computed(() => {
  if (busy.value) return "Working…";
  if (pending.value) return "Retry save";
  if (props.mode === "manual") return "Create item";
  if (textIsByok.value || textCost.value === null) return "Generate item";
  return `Generate item · ${textCost.value} ${textCost.value === 1 ? "credit" : "credits"}`;
});

function manualPayload(campaignId: string): ItemInsert {
  return {
    campaign_id: campaignId, name: itemName.value.trim(), item_type: itemType.value, rarity: rarity.value,
    subtype: null, requires_attunement: false, attunement_requirements: null,
    weight: weight.value, cost: null,
    damage_rolls: isWeaponType(itemType.value) && damageDice.value.trim()
      ? [{ dice: damageDice.value.trim(), type: damageType.value }]
      : null,
    armor_class: isArmorType(itemType.value) ? armorClass.value.trim() || null : null,
    properties: [],
    charges: null, recharge: null, spell_ids: [], description: description.value,
    source: null, tags: [], image_url: null, is_arcane_focus: false, curse_description: null,
  };
}

function assertCampaign(campaignId: string) {
  if (campaign.activeCampaignId !== campaignId) throw new Error("Return to the item's campaign to save it.");
}

async function submit() {
  if (!ready.value || busy.value) return;
  const campaignId = props.campaignId;
  busy.value = true;
  emit("busy", true);
  error.value = null;
  try {
    assertCampaign(campaignId);
    if (props.mode === "manual" && isWeaponType(itemType.value) && damageDice.value.trim() && !parseExpression(damageDice.value)) {
      throw new Error("Enter valid damage dice, such as 1d8.");
    }
    if (props.mode === "ai" && !pending.value) {
      if (!requireCredits(textCost.value, textIsByok.value)) return;
      const result = await generate(concept.value.trim(), { generateImage: generateImage.value });
      if (!result) throw new Error(generatorError.value ?? "Item generation could not start. Try again.");
      pending.value = generatedItemPayload(result, campaignId);
    }
    assertCampaign(campaignId);
    const item = await createItem(pending.value ?? manualPayload(campaignId));
    pending.value = null;
    emit("created", item);
  } catch (failure) {
    error.value = failure instanceof Error ? failure.message : "Couldn't save the item. Try again.";
  } finally {
    busy.value = false;
    emit("busy", false);
  }
}
</script>
