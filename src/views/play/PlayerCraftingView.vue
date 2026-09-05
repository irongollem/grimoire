<template>
  <PageHeader title="Crafting" description="Your known recipes and craft attempts">

    <div v-if="!member" class="text-body text-muted-foreground italic">
      No linked character found.
    </div>

    <template v-else>
      <!-- Discipline tabs — only disciplines with accessible recipes, plus All -->
      <div class="flex flex-wrap gap-1 mb-6 overflow-x-auto pb-1">
        <AppButton
          variant="subtle"
          size="sm"
          class="shrink-0"
          :active="ui.playerCraftingActiveTab === 'all'"
          :icon="IconListView"
          label="All"
          @click="ui.playerCraftingActiveTab = 'all'"
        />
        <AppButton
          v-for="d in availableDisciplines"
          :key="d.id"
          variant="subtle"
          size="sm"
          class="shrink-0"
          :class="isTabDimmed(d) ? 'opacity-60' : ''"
          :active="ui.playerCraftingActiveTab === d.id"
          :icon="d.icon"
          :tooltip="!hasProficiency(d.tools) ? `No ${d.tools[0]} proficiency — no proficiency bonus` : d.label"
          @click="ui.playerCraftingActiveTab = d.id"
        >
          <span>{{ d.label }}<span v-if="!hasProficiency(d.tools)" class="text-eyebrow text-muted-foreground/60 ml-1">NO PROF</span></span>
        </AppButton>
      </div>

      <!-- Discipline description (only when a specific discipline is selected) -->
      <p v-if="activeDiscipline" class="text-body text-muted-foreground italic mb-5">
        {{ activeDiscipline.description }}
        <span class="not-italic ml-1">
          Uses <span class="font-semibold text-foreground">{{ activeDiscipline.ability.toUpperCase() }}</span>
          ({{ abilityModFor(activeDiscipline) >= 0 ? "+" : "" }}{{ abilityModFor(activeDiscipline) }})
          <template v-if="hasProficiency(activeDiscipline.tools)">
            + Proficiency (+{{ member.proficiency_bonus }}).
          </template>
          <template v-else>
            — <span class="text-gold-400">no proficiency bonus</span>.
          </template>
        </span>
      </p>

      <!-- Recipes -->
      <div v-if="disciplineRecipes.length === 0" class="rounded-lg border border-border border-dashed px-6 py-10 text-center">
        <component
          :is="activeDiscipline ? activeDiscipline.icon : IconListView"
          class="h-8 w-8 text-muted-foreground/40 mx-auto mb-3"
        />
        <p class="font-cinzel text-sm font-semibold text-muted-foreground">No recipes known</p>
        <p class="text-caption text-muted-foreground/60 italic mt-1">
          {{ activeDiscipline
            ? `Your DM can share ${activeDiscipline.label.toLowerCase()} recipes with you.`
            : 'Your DM can share recipes with you.' }}
        </p>
      </div>

      <div v-else class="grid gap-4 sm:grid-cols-2">
        <div
          v-for="recipe in visibleRecipes"
          :key="recipe.id"
          class="rounded-lg border border-border bg-card flex flex-col overflow-hidden"
        >
          <!-- Card header -->
          <div class="px-4 py-3 border-b border-border bg-muted/20 flex items-start justify-between gap-2">
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 mb-0.5">
                <p class="font-cinzel text-sm font-bold text-foreground truncate">{{ recipe.name }}</p>
                <span
                  v-if="!activeDiscipline"
                  class="shrink-0 text-label px-1.5 py-0.5 rounded bg-muted text-muted-foreground"
                >{{ getDiscipline(recipe.discipline).label }}</span>
              </div>
              <p class="text-caption text-muted-foreground">
                DC {{ recipe.dc }} · {{ recipe.crafting_time }} {{ recipe.crafting_time !== 1 ? recipe.crafting_time_unit : recipe.crafting_time_unit.replace(/s$/, '') }}
                <span v-if="outputsFor(recipe.id).length"> · → {{ outputsFor(recipe.id).map(o => (o.quantity > 1 ? `${o.quantity}× ` : '') + (itemName(o.item_id))).join(', ') }}</span>
              </p>
              <p
                v-if="recipe.requires_tools && !hasTools(getDiscipline(recipe.discipline).tools)"
                class="text-caption text-destructive mt-0.5"
              >Requires {{ getDiscipline(recipe.discipline).tools[0] }}</p>
              <p
                v-else-if="!recipe.requires_tools && !hasTools(getDiscipline(recipe.discipline).tools)"
                class="text-caption text-gold-400 mt-0.5"
              >No {{ getDiscipline(recipe.discipline).tools[0] }} — disadvantage</p>
            </div>
            <span
              v-if="recipe.requires_proficiency && !hasProficiency(getDiscipline(recipe.discipline).tools)"
              class="shrink-0 text-eyebrow px-1.5 py-0.5 rounded border border-destructive/40 text-destructive bg-destructive/10"
              :title="`Requires ${getDiscipline(recipe.discipline).tools[0]} proficiency`"
            >
              LOCKED
            </span>
            <span
              v-else-if="recipe.requires_tools && !hasTools(getDiscipline(recipe.discipline).tools)"
              class="shrink-0 text-eyebrow px-1.5 py-0.5 rounded border border-destructive/40 text-destructive bg-destructive/10"
              :title="`Requires ${getDiscipline(recipe.discipline).tools[0]} in inventory`"
            >
              NO TOOLS
            </span>
            <span
              v-else-if="!hasTools(getDiscipline(recipe.discipline).tools)"
              class="shrink-0 text-eyebrow px-1.5 py-0.5 rounded border border-gold-500/40 text-gold-400 bg-gold-500/10"
              :title="`Requires ${getDiscipline(recipe.discipline).tools[0]} in inventory — roll at disadvantage`"
            >
              DISADV
            </span>
          </div>

          <!-- Description -->
          <div
            v-if="recipe.description"
            class="px-4 pt-3 text-body text-muted-foreground italic prose prose-sm prose-invert max-w-none"
            v-html="renderDescription(recipe.description)"
          />

          <!-- Ingredients -->
          <div class="px-4 py-3 flex-1">
            <p class="text-label font-semibold text-muted-foreground mb-2">INGREDIENTS</p>
            <div
              v-for="ing in ingredientsFor(recipe.id)"
              :key="ing.id"
              class="flex items-center gap-2 mb-1"
            >
              <component
                :is="hasEnough(ing) ? IconCheckCircle : IconCloseCircle"
                class="h-3.5 w-3.5 shrink-0"
                :class="hasEnough(ing) ? 'text-elven-green' : 'text-destructive'"
              />
              <span class="text-caption text-foreground flex-1 truncate" :class="{ italic: !ing.item_id }">
                {{ ingredientLabel(ing) }}
              </span>
              <span class="font-cinzel text-2xs text-muted-foreground shrink-0">
                {{ ownedCount(ing) }}/{{ ing.quantity }}
              </span>
            </div>
            <p v-if="ingredientsFor(recipe.id).length === 0" class="text-caption text-muted-foreground italic">
              No ingredients required.
            </p>
          </div>

          <!-- Attempt button -->
          <div class="px-4 py-3 border-t border-border">
            <AppButton
              variant="primary"
              size="md"
              block
              :icon="IconDiceRoll"
              :disabled="!canCraft(recipe)"
              :tooltip="recipe.requires_proficiency && !hasProficiency(getDiscipline(recipe.discipline).tools) ? `Requires ${getDiscipline(recipe.discipline).tools[0]} proficiency` : undefined"
              label="Attempt Craft"
              @click="openAttempt(recipe)"
            />
          </div>
        </div>
      </div>

      <div ref="sentinelRef" />
    </template>

    <!-- Attempt dialog -->
    <CraftAttemptDialog
      v-if="attemptRecipe && member && attemptDiscipline"
      :open="!!attemptRecipe"
      :recipe="attemptRecipe"
      :outputs="outputsFor(attemptRecipe.id)"
      :required-ingredients="ingredientsFor(attemptRecipe.id)"
      :modifiers="modifiersFor(attemptRecipe.id)"
      :inventory="myInventory"
      :all-items="allItems ?? []"
      :output-name-map="craftableOutputNames"
      :member="member"
      :has-tools="hasTools(attemptDiscipline.tools)"
      :has-proficiency="hasProficiency(attemptDiscipline.tools)"
      :workspace-bonus="attemptDiscipline.workspaceBonus"
      :workspace-label="attemptDiscipline.workspaceLabel"
      @close="attemptRecipe = null"
      @done="onDone"
    />
  </PageHeader>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { renderTiptapHtml } from "@/lib/tiptap/renderTiptap";
import { IconCheckCircle, IconCloseCircle, IconDiceRoll, IconListView } from '@/lib/icons';
import PageHeader from "@/components/common/PageHeader.vue";
import AppButton from "@/components/common/AppButton.vue";
import CraftAttemptDialog from "@/components/crafting/CraftAttemptDialog.vue";
import { CRAFTING_DISCIPLINES, getDiscipline } from "@/lib/crafting-disciplines";
import type { DisciplineConfig } from "@/lib/crafting-disciplines";
import { canonicalToolName, hasToolProficiency } from "@/rules/toolProficiency";
import { usePlayerCraftingRecipes, useAllRecipeIngredients, useAllRecipeModifiers, useAllRecipeOutputs, useCraftableOutputItems } from "@/composables/crafting/useCrafting";
import { useInfiniteScroll } from "@/composables/useInfiniteScroll";
import { usePlayerVisibleItems } from "@/composables/items/useItems";
import { useParty } from "@/composables/party/useParty";
import { usePartyInventory } from "@/composables/items/usePartyInventory";
import { useAuthStore } from "@/stores/auth";
import { useUiStore } from "@/stores/ui";
import type { CraftingRecipe, CraftingDiscipline, CraftingIngredient, CraftingModifier, CraftingOutput, CraftingAttemptResult } from "@/types/crafting.types";

const auth = useAuthStore();
const ui = useUiStore();
const { data: recipes } = usePlayerCraftingRecipes();
const { data: allItems } = usePlayerVisibleItems();
const { map: craftableOutputNames } = useCraftableOutputItems();
const { data: partyMembers } = useParty();
const { data: inventory } = usePartyInventory();

const attemptRecipe = ref<CraftingRecipe | null>(null);

// Resolve current party member
const member = computed(() => {
  const memberId = ui.dmPreviewMode ? ui.dmPreviewPartyMemberId : auth.linkedPartyMemberId;
  return partyMembers.value?.find((m) => m.id === memberId) ?? null;
});

const myInventory = computed(() =>
  (inventory.value ?? []).filter(
    (i) => i.carried_by === member.value?.id || i.carried_by === null,
  ),
);

// Only disciplines that have at least one accessible recipe
const availableDisciplines = computed(() => {
  const disciplinesWithRecipes = new Set((recipes.value ?? []).map((r) => r.discipline));
  return CRAFTING_DISCIPLINES.filter((d) => disciplinesWithRecipes.has(d.id));
});

const activeDiscipline = computed(() =>
  ui.playerCraftingActiveTab === "all" ? null : getDiscipline(ui.playerCraftingActiveTab as CraftingDiscipline),
);

// Discipline used for the attempt dialog — derived from the recipe being attempted
const attemptDiscipline = computed(() =>
  attemptRecipe.value ? getDiscipline(attemptRecipe.value.discipline) : null,
);

// Ability modifier for a given discipline
function abilityModFor(discipline: DisciplineConfig): number {
  if (!member.value) return 0;
  const score = member.value[discipline.ability];
  return Math.floor((score - 10) / 2);
}

// Check tool proficiency on character — any accepted tool counts. Both sides
// are canonicalised inside hasToolProficiency, so a dirty stored value like
// "Herbalist kit" still satisfies a discipline that requires "Herbalism Kit".
function hasProficiency(tools: string[]): boolean {
  return hasToolProficiency(member.value?.tool_proficiencies, tools);
}

// Check if player has any accepted tool in inventory. The discipline's tool
// name is canonicalised before the substring match so a differently-cased
// inventory row (e.g. "Forgery kit") still matches "Forgery Kit".
function hasTools(tools: string[]): boolean {
  return tools.some((tool) => {
    const canonical = canonicalToolName(tool) ?? tool;
    return myInventory.value.some(
      (inv) => inv.name.toLowerCase().includes(canonical.toLowerCase()) && !inv.is_ruined,
    );
  });
}

const disciplineRecipes = computed(() =>
  ui.playerCraftingActiveTab === "all"
    ? (recipes.value ?? [])
    : (recipes.value ?? []).filter((r) => r.discipline === ui.playerCraftingActiveTab),
);

// Page the grid in on scroll rather than mounting every recipe at once.
// A recipe card is ~5ms of mount work (47 nodes, an AppButton and three glyph
// components each), so the 184-recipe "All" tab rendered as one unbroken 977ms
// task in a production build on a fast desktop. A low-end Chromebook is several
// times slower than that, and during a single long task the browser answers no
// input at all — not even a reload — which is how the tab read as hung before
// Chrome killed the renderer. The page size is smaller than the 48 the other
// list views use because this card is much heavier than a grid tile.
const { visibleItems: visibleRecipes, sentinelRef } = useInfiniteScroll(disciplineRecipes, 24);

const allRecipeIds = computed(() => (recipes.value ?? []).map((r) => r.id));
const ingredientsMap = useAllRecipeIngredients(allRecipeIds);
const outputsMap = useAllRecipeOutputs(allRecipeIds);
const modifiersMap = useAllRecipeModifiers(allRecipeIds);

function ingredientsFor(recipeId: string): CraftingIngredient[] {
  return ingredientsMap.value.get(recipeId) ?? [];
}

function modifiersFor(recipeId: string): CraftingModifier[] {
  return modifiersMap.value.get(recipeId) ?? [];
}

function outputsFor(recipeId: string): CraftingOutput[] {
  return outputsMap.value.get(recipeId) ?? [];
}

function itemName(itemId: string): string {
  return allItems.value?.find((i) => i.id === itemId)?.name
    // A recipe output the player has never held isn't in their visible items, so
    // resolve its name from the craftable-output projection before giving up.
    ?? craftableOutputNames.value.get(itemId)
    ?? "Unknown item";
}

function ingredientLabel(ing: CraftingIngredient): string {
  if (ing.item_id) return itemName(ing.item_id);
  if (!ing.tags) return "Any";
  return `Any "${ing.tags.join(", ")}"`;
}

function ownedCount(ing: CraftingIngredient): number {
  if (ing.item_id) {
    return myInventory.value
      .filter((i) => i.item_id === ing.item_id && !i.is_ruined)
      .reduce((sum, i) => sum + i.quantity, 0);
  }
  // Tag-based: sum all non-ruined inventory items whose vault definition has ALL required tags
  return myInventory.value
    .filter((i) => {
      if (i.is_ruined) return false;
      const def = allItems.value?.find((a) => a.id === i.item_id);
      return ing.tags!.every((t) => def?.tags?.includes(t) ?? false);
    })
    .reduce((sum, i) => sum + i.quantity, 0);
}

function hasEnough(ing: CraftingIngredient): boolean {
  return ownedCount(ing) >= ing.quantity;
}

function canCraft(recipe: CraftingRecipe): boolean {
  const discipline = getDiscipline(recipe.discipline);
  if (recipe.requires_proficiency && !hasProficiency(discipline.tools)) return false;
  if (recipe.requires_tools && !hasTools(discipline.tools)) return false;
  return ingredientsFor(recipe.id).every((ing) => hasEnough(ing));
}

// Dims a tab for a discipline the character has no proficiency in — but only
// while it isn't the selected tab, matching the old ternary's precedence.
function isTabDimmed(d: DisciplineConfig): boolean {
  return ui.playerCraftingActiveTab !== d.id && !hasProficiency(d.tools);
}

function renderDescription(content: string | null): string {
  return renderTiptapHtml(content);
}

function openAttempt(recipe: CraftingRecipe) {
  attemptRecipe.value = recipe;
}

function onDone(_result: CraftingAttemptResult) {
  attemptRecipe.value = null;
}
</script>
