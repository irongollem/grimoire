<template>
  <Transition name="fade">
    <div
      v-if="ui.lootTableGeneratorOpen"
      class="fixed inset-0 bg-black/60 z-40"
      @click="handleClose"
    />
  </Transition>

  <Transition name="slide-right">
    <aside
      v-if="ui.lootTableGeneratorOpen"
      class="fixed right-0 top-0 bottom-0 w-full max-w-md bg-card border-l border-border z-50 flex flex-col"
    >
      <!-- Header -->
      <div class="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
        <h2 class="text-heading-sm font-semibold text-foreground">Loot Table Generator</h2>
        <button class="text-muted-foreground hover:text-foreground" @click="handleClose">
          <IconClose class="h-5 w-5" />
        </button>
      </div>

      <!-- Body -->
      <div class="flex-1 overflow-y-auto p-5 space-y-5">
        <!-- Generating state -->
        <div v-if="isGenerating" class="flex flex-col items-center gap-3 py-4">
          <IconGenerate class="h-7 w-7 text-primary animate-pulse" />
          <p class="text-body text-muted-foreground italic text-center">
            {{ currentLoadingQuote }}
          </p>
          <button
            type="button"
            class="mt-1 text-caption text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
            @click="dismissToBackground"
          >
            Continue in background
          </button>
        </div>

        <!-- Error state -->
        <div
          v-else-if="genError"
          class="rounded-md bg-destructive/10 border border-destructive/30 px-3 py-2"
        >
          <p class="text-caption text-destructive">{{ genError }}</p>
        </div>

        <!-- Results state -->
        <template v-else-if="result">
          <div class="flex items-center justify-between">
            <p class="text-label-lg font-semibold text-muted-foreground">GENERATED HOARD</p>
            <button
              type="button"
              class="text-caption text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
              @click="clearResult"
            >
              Regenerate
            </button>
          </div>

          <div class="rounded-md border border-border bg-muted/30 p-4 space-y-3">
            <div class="flex items-start justify-between gap-2">
              <h3 class="font-cinzel text-sm font-bold text-foreground leading-tight">{{ result.name }}</h3>
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
                  {{ entry.kind === "unresolved" ? "—" : `${entry.dropChance}%` }}
                </span>
                <span class="min-w-0">
                  <template v-if="entry.kind === 'item'">
                    <span class="font-semibold" :style="{ color: rarityColor(entry.item.rarity) }">{{ entry.item.name }}</span>
                    <span class="text-muted-foreground"> ×{{ entry.dice ?? entry.fixedQty }}</span>
                  </template>
                  <template v-else-if="entry.kind === 'currency'">
                    <IconCoins class="inline h-3 w-3 mb-0.5 mr-0.5 text-amber-400" />
                    {{ entry.label ?? "Coins" }}
                    <span class="text-muted-foreground"> — {{ formatCoins(entry) }}</span>
                  </template>
                  <template v-else-if="entry.kind === 'random'">
                    Random {{ ITEM_RARITY_LABELS[entry.rarity].toLowerCase() }}
                    {{ entry.itemTypeFilter ? ITEM_TYPE_LABELS[entry.itemTypeFilter].toLowerCase() : "item" }}
                    <span class="text-muted-foreground"> ×{{ entry.dice ?? entry.fixedQty }}</span>
                  </template>
                  <template v-else>
                    <span class="line-through">{{ entry.generatedName }}</span>
                    <span class="italic text-muted-foreground/70"> — {{ entry.reason }}</span>
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
            <IconWarning class="h-3.5 w-3.5 text-amber-400 shrink-0 mt-0.5" />
            <p class="text-caption text-muted-foreground">
              {{ unresolvedCount }} {{ unresolvedCount === 1 ? "entry" : "entries" }} couldn't be matched to a real
              item and {{ unresolvedCount === 1 ? "is" : "are" }} left out of the table.
              <template v-if="result.grounded === false">
                This generation ran without your Vault (the semantic index isn't available), so the model was
                guessing at names — an admin re-embed usually fixes it.
              </template>
              <template v-else>
                Add {{ unresolvedCount === 1 ? "it" : "them" }} to the Vault, or enable the source
                {{ unresolvedCount === 1 ? "it comes" : "they come" }} from, and regenerate.
              </template>
            </p>
          </div>
        </template>

        <!-- Form state -->
        <template v-else>
          <!-- Concept -->
          <div>
            <label class="block text-label-lg font-semibold text-muted-foreground mb-1.5">
              CONCEPT
              <span class="font-fell normal-case tracking-normal text-muted-foreground/60 ml-1">(AI will use this)</span>
            </label>
            <textarea
              v-model="concept"
              rows="4"
              :maxlength="CONCEPT_LIMIT"
              placeholder="The smugglers' vault beneath the Rusty Anchor — coin, contraband, one thing they stole and couldn't sell…"
              class="w-full bg-muted border border-border rounded-md px-3 py-2 text-body text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none"
            />
            <div class="flex justify-end mt-1">
              <span
                class="text-caption"
                :class="concept.length >= CONCEPT_LIMIT * 0.9 ? 'text-destructive' : 'text-muted-foreground/50'"
              >{{ concept.length }} / {{ CONCEPT_LIMIT }}</span>
            </div>
          </div>

          <div class="gold-divider" />

          <!-- Tier -->
          <div>
            <label class="block text-label-lg font-semibold text-muted-foreground mb-1.5">
              TIER
              <span class="font-fell normal-case tracking-normal text-muted-foreground/60 ml-1">(filters which items the AI is offered)</span>
            </label>
            <div class="grid grid-cols-3 gap-2">
              <button
                v-for="t in LOOT_CR_TIERS"
                :key="t"
                type="button"
                class="py-1.5 text-label-lg font-semibold rounded-md border transition-colors"
                :class="crTier === t ? 'bg-primary text-primary-foreground border-primary' : 'bg-muted border-border text-muted-foreground hover:text-foreground'"
                @click="crTier = t"
              >{{ LOOT_CR_TIER_LABELS[t] }}</button>
            </div>
            <p class="text-caption text-muted-foreground/70 mt-1.5">
              {{ tierRarityHint }}
            </p>
          </div>

          <!-- Attunement -->
          <label class="flex items-center gap-2 cursor-pointer">
            <input v-model="excludeAttunement" type="checkbox" class="accent-primary" />
            <span class="text-caption text-muted-foreground">Skip items that require attunement</span>
          </label>
        </template>
      </div>

      <!-- Footer -->
      <div class="px-5 py-4 border-t border-border shrink-0 flex flex-col gap-2">
        <!-- Results: create the table -->
        <template v-if="result">
          <p v-if="createError" class="text-caption text-destructive text-center">{{ createError }}</p>
          <button
            v-if="!createdTableId"
            type="button"
            :disabled="creating || creatableCount === 0"
            class="w-full inline-flex items-center justify-center gap-1.5 py-2 text-label-lg font-semibold rounded-md bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-opacity"
            @click="createTable"
          >
            <IconAdd class="h-3.5 w-3.5" />
            {{ creating ? "Creating…" : `Create Table (${creatableCount} ${creatableCount === 1 ? "entry" : "entries"})` }}
          </button>
          <button
            v-else
            type="button"
            class="w-full inline-flex items-center justify-center gap-1.5 py-2 text-label-lg font-semibold rounded-md bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
            @click="viewCreated"
          >
            <IconCheckCircle class="h-3.5 w-3.5" />
            View Table →
          </button>
        </template>

        <!-- Form: generate -->
        <template v-else>
          <GenerationCostBadge
            v-if="isPro && isAiEnabled"
            :credits="textCreditCost"
            :byok="textIsByok"
            class="self-center"
          />
          <button
            v-if="isPro && isAiEnabled"
            type="button"
            :disabled="isAnyAiGenerating || !concept.trim() || !affordable(textCreditCost, textIsByok)"
            :title="isAnyAiGenerating && !isGenerating ? 'Another generation is already in progress' : undefined"
            class="w-full inline-flex items-center justify-center gap-1.5 py-2 text-label-lg font-semibold rounded-md bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-opacity"
            @click="runGenerate"
          >
            <IconGenerate class="h-3.5 w-3.5" />
            {{ isGenerating ? "Generating…" : "Generate with AI" }}
          </button>
          <button
            v-else-if="!isPro"
            type="button"
            class="w-full inline-flex items-center justify-center gap-1.5 py-2 text-label-lg font-semibold rounded-md bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
            @click="showPaywall = true"
          >
            <IconGenerate class="h-3.5 w-3.5" />
            Generate with AI
          </button>
        </template>
      </div>
    </aside>
  </Transition>

  <PaywallModal
    v-model="showPaywall"
    message="AI generation is a Pro feature. Upgrade to generate loot tables, NPCs, monsters, items, spells, and more."
  />
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { useRouter } from "vue-router";
import { AI_PROMPT_LIMIT_SHORT } from "@/ai/utils";
import { IconAdd, IconCheckCircle, IconClose, IconCoins, IconGenerate, IconWarning } from "@/lib/icons";
import { useUiStore } from "@/stores/ui";
import { useCampaignStore } from "@/stores/campaign";
import { useItems, useEnsureOwnedItem } from "@/composables/useItems";
import { useCreateLootTable } from "@/composables/useLootTables";
import { useLootGeneration } from "@/ai/useLootGeneration";
import { resolveGeneratedLoot, type ResolvedLootEntry } from "@/ai/resolveGeneratedLoot";
import { useSubscription } from "@/composables/useSubscription";
import { currentLoadingQuote } from "@/ai/aiGenerationState";
import { isAnyAiGenerating } from "@/ai/aiGeneratorRegistry";
import PaywallModal from "@/components/common/PaywallModal.vue";
import GenerationCostBadge from "@/components/common/GenerationCostBadge.vue";
import { useAiCredits } from "@/composables/useAiCredits";
import { useProviderConfig } from "@/composables/useProviderConfig";
import {
  LOOT_CR_TIERS,
  LOOT_CR_TIER_LABELS,
  LOOT_TIER_RARITIES,
  validateEntries,
  type LootCrTier,
  type LootEntry,
} from "@/types/lootTable.types";
import { ITEM_RARITY_LABELS, ITEM_TYPE_LABELS, RARITY_BADGE_COLORS, type ItemRarity } from "@/types/item.types";

const CONCEPT_LIMIT = AI_PROMPT_LIMIT_SHORT;

const ui = useUiStore();
const router = useRouter();
const campaign = useCampaignStore();
// Mounted on every DM page — the vault catalogue is multiple MB, so only fetch
// it once the panel is actually open (same guard the other panels use).
const { data: vaultItems } = useItems(() => ({ enabled: ui.lootTableGeneratorOpen }));
const { ensureOwnedItem } = useEnsureOwnedItem();
const { isPro } = useSubscription();
const showPaywall = ref(false);

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

const isAiEnabled = computed(() => campaign.isAiEnabled);

const concept = ref("");
const crTier = ref<LootCrTier>("5-10");
const excludeAttunement = ref(false);

const tierRarityHint = computed(() => {
  const rarities = LOOT_TIER_RARITIES[crTier.value];
  if (rarities.length === 0) return "No rarity filter — the AI may be offered anything in your Vault.";
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

function rarityColor(rarity: string): string {
  return RARITY_BADGE_COLORS[rarity as ItemRarity] ?? RARITY_BADGE_COLORS.mundane;
}

const COIN_ORDER = ["pp", "gp", "ep", "sp", "cp"] as const;

function formatCoins(entry: Extract<ResolvedLootEntry, { kind: "currency" }>): string {
  const parts = COIN_ORDER.filter((c) => entry[c] > 0).map((c) => `${entry[c]} ${c}`);
  return parts.length > 0 ? parts.join(", ") : "no coin";
}

const creating = ref(false);
const createError = ref<string | null>(null);
const createdTableId = ref<string | null>(null);

const { costOf, affordable } = useAiCredits();
const { textMultiplierFor } = useProviderConfig();
const textProvider = computed(() => campaign.activeCampaign?.text_provider ?? "openai");
const textIsByok = computed(() => !!campaign.decryptedApiKey);
const textCreditCost = computed(
  () => Math.round(costOf("loot_generation") * textMultiplierFor(textProvider.value) * 100) / 100,
);

function handleClose() {
  ui.lootTableGeneratorOpen = false;
}

function dismissToBackground() {
  ui.lootTableGeneratorOpen = false;
}

async function runGenerate() {
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
 * Persist the resolved entries. Item entries go through `ensureOwnedItem`
 * first: a name may have resolved to a shared `library_items` row whose id is
 * a text slug, and `LootEntry.item_id` is a uuid FK into the DM's own `items`.
 * That clone is the same one the manual item picker performs, so a generated
 * table and a hand-built one reference identical rows.
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
        const source = (vaultItems.value ?? []).find((i) => i.id === resolved.item.id);
        if (!source) continue;
        const owned = await ensureOwnedItem(source);
        entries.push({
          id: crypto.randomUUID(),
          type: "item",
          item_id: owned.id,
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

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
.slide-right-enter-active,
.slide-right-leave-active {
  transition: transform 0.25s ease;
}
.slide-right-enter-from,
.slide-right-leave-to {
  transform: translateX(100%);
}
</style>
