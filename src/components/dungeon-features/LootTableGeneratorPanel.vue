<template>
  <GeneratorPanelShell
    v-model:open="ui.lootTableGeneratorOpen"
    v-model:concept="concept"
    title="Loot Table Generator"
    concept-placeholder="The smugglers' vault beneath the Rusty Anchor: coin, contraband, one thing they stole and couldn't sell…"
    :concept-limit="CONCEPT_LIMIT"
    :credits="textCreditCost"
    :byok="textIsByok"
    :is-generating="isGenerating"
    :error="genError"
    :show-results="!!result"
    @generate="runGenerate"
  >
    <template #constraints>
      <div>
        <label class="block text-caption text-muted-foreground mb-1">
          Tier
          <span class="font-fell text-muted-foreground/60 ml-1">(filters which items the AI is offered)</span>
        </label>
        <div class="grid grid-cols-3 gap-2">
          <AppButton
            v-for="t in LOOT_CR_TIERS"
            :key="t"
            variant="subtle"
            surface="muted"
            size="sm"
            :active="crTier === t"
            :label="LOOT_CR_TIER_LABELS[t]"
            @click="crTier = t"
          />
        </div>
        <p class="text-caption text-muted-foreground/70 mt-1.5">
          {{ tierRarityHint }}
        </p>
      </div>

      <AppCheckbox
        v-model="excludeAttunement"
        label="Skip items that require attunement"
        label-role="caption"
      />
    </template>

    <template v-if="result" #results>
      <div class="flex items-center justify-between">
        <p class="text-label-lg font-semibold text-muted-foreground">GENERATED HOARD</p>
        <AppButton
          variant="ghost"
          size="inline-caption"
          class="underline underline-offset-2"
          label="Regenerate"
          @click="clearResult"
        />
      </div>

      <div class="rounded-md border border-border bg-muted/30 p-4 space-y-3">
        <div class="flex items-start justify-between gap-2">
          <h3 class="text-heading-sm font-bold text-foreground leading-tight">{{ result.name }}</h3>
          <span
            v-if="crTier !== 'any'"
            class="text-label px-1.5 py-0.5 rounded bg-primary/10 text-primary font-semibold shrink-0"
          >{{ LOOT_CR_TIER_LABELS[crTier] }}</span>
        </div>
        <p v-if="result.description" class="text-caption text-muted-foreground italic">{{ result.description }}</p>

        <ul class="space-y-1.5">
          <li
            v-for="(entry, i) in resolvedEntries"
            :key="i"
            class="flex items-start gap-2 text-caption"
            :class="entry.kind === 'unresolved' ? 'text-muted-foreground' : 'text-foreground'"
          >
            <span class="text-label text-primary font-semibold shrink-0 mt-0.5 w-9 text-right">
              {{ entry.kind === "unresolved" ? "?" : `${entry.dropChance}%` }}
            </span>
            <span class="min-w-0">
              <template v-if="entry.kind === 'item'">
                <span class="font-semibold" :class="rarityTextClass(entry.item.rarity)">{{ entry.item.name }}</span>
                <span class="text-muted-foreground"> ×{{ entry.dice ?? entry.fixedQty }}</span>
              </template>
              <template v-else-if="entry.kind === 'currency'">
                <IconCoins class="inline h-3 w-3 mb-0.5 mr-0.5 text-ink-caution" />
                {{ entry.label ?? "Coins" }}
                <span class="text-muted-foreground">: {{ formatCoins(entry) }}</span>
              </template>
              <template v-else-if="entry.kind === 'random'">
                Random {{ ITEM_RARITY_LABELS[entry.rarity].toLowerCase() }}
                {{ entry.itemTypeFilter ? ITEM_TYPE_LABELS[entry.itemTypeFilter].toLowerCase() : "item" }}
                <span class="text-muted-foreground"> ×{{ entry.dice ?? entry.fixedQty }}</span>
              </template>
              <template v-else>
                <span class="line-through">{{ entry.generatedName }}</span>
                <span class="italic text-muted-foreground/70">: {{ entry.reason }}</span>
              </template>
              <span v-if="entry.kind !== 'unresolved' && entry.notes" class="block text-muted-foreground/70 italic">
                {{ entry.notes }}
              </span>
            </span>
          </li>
        </ul>

        <div v-if="result.tags.length" class="flex flex-wrap gap-1.5 pt-1">
          <span
            v-for="tag in result.tags"
            :key="tag"
            class="rounded-full bg-muted border border-border px-2 py-0.5 text-caption-sm text-muted-foreground"
          >
            {{ tag }}
          </span>
        </div>
      </div>

      <!-- Unresolved names are surfaced, never silently dropped (#337). -->
      <div
        v-if="unresolvedCount"
        class="rounded-md border border-border bg-muted/30 px-3 py-2 flex gap-2"
      >
        <IconWarning class="h-3.5 w-3.5 text-ink-caution shrink-0 mt-0.5" />
        <p class="text-caption text-muted-foreground">
          {{ unresolvedCount }} {{ unresolvedCount === 1 ? "entry" : "entries" }} couldn't be matched to a real
          item and {{ unresolvedCount === 1 ? "is" : "are" }} left out of the table.
          <template v-if="result.grounded === false">
            This generation ran without your Vault (the semantic index isn't available), so the model was
            guessing at names; an admin re-embed usually fixes it.
          </template>
          <template v-else>
            Add {{ unresolvedCount === 1 ? "it" : "them" }} to the Vault, or enable the source
            {{ unresolvedCount === 1 ? "it comes" : "they come" }} from, and regenerate.
          </template>
        </p>
      </div>
    </template>

    <template #results-footer>
      <p v-if="createError" class="text-caption text-destructive text-center">{{ createError }}</p>
      <AppButton
        v-if="!createdTableId"
        variant="primary"
        size="md"
        block
        :disabled="creating || creatableCount === 0"
        :icon="IconAdd"
        :label="creating ? 'Creating…' : `Create Table (${creatableCount} ${creatableCount === 1 ? 'entry' : 'entries'})`"
        @click="createTable"
      />
      <AppButton
        v-else
        variant="primary"
        size="md"
        block
        :icon="IconCheckCircle"
        label="View Table →"
        @click="viewCreated"
      />
    </template>
  </GeneratorPanelShell>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { useRouter } from "vue-router";
import { AI_PROMPT_LIMIT_SHORT } from "@/ai/utils";
import { IconAdd, IconCheckCircle, IconCoins, IconWarning } from "@/lib/icons";
import { useUiStore } from "@/stores/ui";
import { useCampaignStore } from "@/stores/campaign";
import { useItemIndex } from "@/composables/items/useItemIndex";
import { useCreateLootTable } from "@/composables/dungeon-features/useLootTables";
import { useLootGeneration } from "@/ai/useLootGeneration";
import { resolveGeneratedLoot, type ResolvedLootEntry } from "@/ai/resolveGeneratedLoot";
import AppButton from "@/components/common/AppButton.vue";
import AppCheckbox from "@/components/common/AppCheckbox.vue";
import GeneratorPanelShell from "@/components/common/GeneratorPanelShell.vue";
import { useAiCredits } from "@/composables/ai/useAiCredits";
import { useOutOfCredits } from "@/composables/ai/useOutOfCredits";
import { useProviderConfig } from "@/composables/ai/useProviderConfig";
import {
  LOOT_CR_TIERS,
  LOOT_CR_TIER_LABELS,
  LOOT_TIER_RARITIES,
  validateEntries,
  type LootCrTier,
  type LootEntry,
} from "@/types/lootTable.types";
import { ITEM_RARITY_LABELS, ITEM_TYPE_LABELS, RARITY_TEXT, type ItemRarity } from "@/types/item.types";
import { wholeCredits } from "@edge-shared/credit-math.ts";

const CONCEPT_LIMIT = AI_PROMPT_LIMIT_SHORT;

const ui = useUiStore();
const router = useRouter();
const campaign = useCampaignStore();
// Mounted on every DM page — the vault catalogue is multiple MB, so only fetch
// it once the panel is actually open (same guard the other panels use).
const { data: vaultItems } = useItemIndex(() => ({ enabled: ui.lootTableGeneratorOpen }));

const {
  isGenerating,
  error: genError,
  concept: genConcept,
  completedEntityId,
  clearCompleted,
  result,
  generate,
  clearResult,
} = useLootGeneration();

const { mutateAsync: createLootTable } = useCreateLootTable();

const concept = ref("");
const crTier = ref<LootCrTier>("5-10");
const excludeAttunement = ref(false);

const tierRarityHint = computed(() => {
  const rarities = LOOT_TIER_RARITIES[crTier.value];
  if (rarities.length === 0) return "No rarity filter: the AI may be offered anything in your Vault.";
  return `Offers ${rarities.map((r) => ITEM_RARITY_LABELS[r].toLowerCase()).join(", ")} items.`;
});

// The merged catalogue: the DM's own items plus library items their enabled
// sources make visible — the same pool the server offered the model, so a name
// the model took from the candidate block resolves here.
const itemPool = computed(() =>
  (vaultItems.value ?? []).map((i) => ({ id: i.id, name: i.name, rarity: i.rarity, item_type: i.item_type })),
);

const resolvedEntries = computed<ResolvedLootEntry[]>(() =>
  result.value ? resolveGeneratedLoot(result.value.entries, itemPool.value) : [],
);

const unresolvedCount = computed(() => resolvedEntries.value.filter((e) => e.kind === "unresolved").length);
const creatableCount = computed(() => resolvedEntries.value.length - unresolvedCount.value);

function rarityTextClass(rarity: string): string {
  return RARITY_TEXT[rarity as ItemRarity] ?? RARITY_TEXT.mundane;
}

const COIN_ORDER = ["pp", "gp", "ep", "sp", "cp"] as const;

function formatCoins(entry: Extract<ResolvedLootEntry, { kind: "currency" }>): string {
  const parts = COIN_ORDER.filter((c) => entry[c] > 0).map((c) => `${entry[c]} ${c}`);
  return parts.length > 0 ? parts.join(", ") : "no coin";
}

const creating = ref(false);
const createError = ref<string | null>(null);
const createdTableId = ref<string | null>(null);

const { costOf } = useAiCredits();
const { requireCredits } = useOutOfCredits();
const { textMultiplierFor } = useProviderConfig();
const textProvider = computed(() => campaign.activeCampaign?.text_provider ?? "openai");
const textIsByok = computed(() => !!campaign.decryptedApiKey);
const textCreditCost = computed(
  () => wholeCredits(costOf("loot_generation") * textMultiplierFor(textProvider.value)),
);

async function runGenerate() {
  if (!requireCredits(textCreditCost.value, textIsByok.value)) return;

  genConcept.value = concept.value.trim();
  clearCompleted();
  createdTableId.value = null;
  createError.value = null;
  await generate(concept.value.trim(), {
    crTier: crTier.value,
    excludeAttunement: excludeAttunement.value,
  });
}

/**
 * Persist the resolved entries. An item entry stores the resolved id as-is: a
 * vault uuid or a shared `library_items` text id (`LootEntry.item_id` is jsonb,
 * so either is safe). Nothing is cloned, same as the manual item picker.
 *
 * Unresolved entries are not written — no stub items, no dangling ids (#337).
 * The panel has already told the DM which ones and why.
 */
async function createTable() {
  if (!result.value) return;
  creating.value = true;
  createError.value = null;
  try {
    const entries: LootEntry[] = [];
    for (const resolved of resolvedEntries.value) {
      if (resolved.kind === "unresolved") continue;
      if (resolved.kind === "item") {
        entries.push({
          id: crypto.randomUUID(),
          type: "item",
          item_id: resolved.item.id,
          drop_chance: resolved.dropChance,
          dice: resolved.dice,
          fixed_qty: resolved.fixedQty,
          notes: resolved.notes,
        });
      } else if (resolved.kind === "currency") {
        entries.push({
          id: crypto.randomUUID(),
          type: "currency",
          currency_label: resolved.label,
          drop_chance: resolved.dropChance,
          pp: resolved.pp, gp: resolved.gp, ep: resolved.ep, sp: resolved.sp, cp: resolved.cp,
          notes: resolved.notes,
        });
      } else {
        entries.push({
          id: crypto.randomUUID(),
          type: "random",
          rarity: resolved.rarity,
          item_type_filter: resolved.itemTypeFilter,
          drop_chance: resolved.dropChance,
          dice: resolved.dice,
          fixed_qty: resolved.fixedQty,
          notes: resolved.notes,
        });
      }
    }

    // The same validator the manual editor saves through — a generated table
    // is held to exactly the DM's own standard, and nothing the resolver
    // repaired can slip past it. Reached only if the resolver has a gap, which
    // is the point of having it here.
    const invalid = validateEntries(entries);
    if (invalid) {
      createError.value = `${invalid} Try regenerating.`;
      return;
    }

    const table = await createLootTable({
      campaign_id: campaign.activeCampaignId,
      name: result.value.name,
      description: result.value.description || null,
      cr_tier: crTier.value,
      entries,
      tags: result.value.tags,
      notes: null,
      monster_ids: [],
      ai_provenance: result.value.ai_provenance ?? null,
    });
    createdTableId.value = table.id;
    completedEntityId.value = table.id;
  } catch (e) {
    createError.value = e instanceof Error ? e.message : "Could not create the table.";
  } finally {
    creating.value = false;
  }
}

function viewCreated() {
  if (!createdTableId.value) return;
  ui.lootTableGeneratorOpen = false;
  router.push(`/loot-tables/${createdTableId.value}`);
}
</script>
