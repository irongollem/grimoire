<template>
  <PageHeader title="Crafting" description="Your known recipes and craft attempts">

    <div v-if="!member" class="font-fell text-sm text-muted-foreground italic">
      No linked character found.
    </div>

    <template v-else>
      <!-- Discipline tabs — only disciplines with accessible recipes, plus All -->
      <div class="flex flex-wrap gap-1 mb-6 overflow-x-auto pb-1">
        <button
          class="flex items-center gap-1.5 px-3 py-2 rounded-md border font-cinzel text-xs tracking-wide transition-colors shrink-0"
          :class="ui.playerCraftingActiveTab === 'all'
            ? 'border-primary bg-primary/10 text-foreground'
            : 'border-border text-muted-foreground hover:text-foreground hover:border-border/80'"
          @click="ui.playerCraftingActiveTab = 'all'"
        >
          <LayoutList class="h-3.5 w-3.5" />
          All
        </button>
        <button
          v-for="d in availableDisciplines"
          :key="d.id"
          class="flex items-center gap-1.5 px-3 py-2 rounded-md border font-cinzel text-xs tracking-wide transition-colors shrink-0"
          :class="tabClass(d)"
          :title="!hasProficiency(d.tools) ? `No ${d.tools[0]} proficiency — no proficiency bonus` : d.label"
          @click="ui.playerCraftingActiveTab = d.id"
        >
          <component :is="d.icon" class="h-3.5 w-3.5" />
          {{ d.label }}
          <span v-if="!hasProficiency(d.tools)" class="font-cinzel text-2xs md:text-sm text-muted-foreground/60 tracking-wider">NO PROF</span>
        </button>
      </div>

      <!-- Discipline description (only when a specific discipline is selected) -->
      <p v-if="activeDiscipline" class="font-fell text-sm text-muted-foreground italic mb-5">
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
          :is="activeDiscipline ? activeDiscipline.icon : LayoutList"
          class="h-8 w-8 text-muted-foreground/40 mx-auto mb-3"
        />
        <p class="font-cinzel text-sm font-semibold text-muted-foreground">No recipes known</p>
        <p class="font-fell text-xs text-muted-foreground/60 italic mt-1">
          {{ activeDiscipline
            ? `Your DM can share ${activeDiscipline.label.toLowerCase()} recipes with you.`
            : 'Your DM can share recipes with you.' }}
        </p>
      </div>

      <div v-else class="grid gap-4 sm:grid-cols-2">
        <div
          v-for="recipe in disciplineRecipes"
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
                  class="shrink-0 font-cinzel text-2xs md:text-sm tracking-wider px-1.5 py-0.5 rounded bg-muted text-muted-foreground"
                >{{ getDiscipline(recipe.discipline).label }}</span>
              </div>
              <p class="font-fell text-xs text-muted-foreground">
                DC {{ recipe.dc }} · {{ recipe.crafting_time }} {{ recipe.crafting_time !== 1 ? recipe.crafting_time_unit : recipe.crafting_time_unit.replace(/s$/, '') }}
                <span v-if="outputsFor(recipe.id).length"> · → {{ outputsFor(recipe.id).map(o => (o.quantity > 1 ? `${o.quantity}× ` : '') + (itemName(o.item_id))).join(', ') }}</span>
              </p>
            </div>
            <span
              v-if="recipe.requires_proficiency && !hasProficiency(getDiscipline(recipe.discipline).tools)"
              class="shrink-0 font-cinzel text-2xs md:text-sm tracking-wider px-1.5 py-0.5 rounded border border-destructive/40 text-destructive bg-destructive/10"
              :title="`Requires ${getDiscipline(recipe.discipline).tools[0]} proficiency`"
            >
              LOCKED
            </span>
            <span
              v-else-if="recipe.requires_tools && !hasTools(getDiscipline(recipe.discipline).tools)"
              class="shrink-0 font-cinzel text-2xs md:text-sm tracking-wider px-1.5 py-0.5 rounded border border-destructive/40 text-destructive bg-destructive/10"
              :title="`Requires ${getDiscipline(recipe.discipline).tools[0]} in inventory`"
            >
              NO TOOLS
            </span>
            <span
              v-else-if="!hasTools(getDiscipline(recipe.discipline).tools)"
              class="shrink-0 font-cinzel text-2xs md:text-sm tracking-wider px-1.5 py-0.5 rounded border border-gold-500/40 text-gold-400 bg-gold-500/10"
              title="No tool in inventory — disadvantage"
            >
              DISADV
            </span>
          </div>

          <!-- Description -->
          <div
            v-if="recipe.description"
            class="px-4 pt-3 font-fell text-sm text-muted-foreground italic prose prose-sm prose-invert max-w-none"
            v-html="renderDescription(recipe.description)"
          />

          <!-- Ingredients -->
          <div class="px-4 py-3 flex-1">
            <p class="font-cinzel text-2xs md:text-sm font-semibold tracking-wider text-muted-foreground mb-2">INGREDIENTS</p>
            <div
              v-for="ing in ingredientsFor(recipe.id)"
              :key="ing.id"
              class="flex items-center gap-2 mb-1"
            >
              <component
                :is="hasEnough(ing) ? CheckCircle : XCircle"
                class="h-3.5 w-3.5 shrink-0"
                :class="hasEnough(ing) ? 'text-elven-green' : 'text-destructive'"
              />
              <span class="font-fell text-xs text-foreground flex-1 truncate" :class="{ italic: !ing.item_id }">
                {{ ingredientLabel(ing) }}
              </span>
              <span class="font-cinzel text-2xs md:text-sm text-muted-foreground shrink-0">
                {{ ownedCount(ing) }}/{{ ing.quantity }}
              </span>
            </div>
            <p v-if="ingredientsFor(recipe.id).length === 0" class="font-fell text-xs text-muted-foreground italic">
              No ingredients required.
            </p>
          </div>

          <!-- Attempt button -->
          <div class="px-4 py-3 border-t border-border">
            <button
              :disabled="!canCraft(recipe)"
              :title="recipe.requires_proficiency && !hasProficiency(getDiscipline(recipe.discipline).tools) ? `Requires ${getDiscipline(recipe.discipline).tools[0]} proficiency` : undefined"
              class="w-full inline-flex items-center justify-center gap-1.5 rounded-md bg-primary px-4 py-2 font-cinzel text-xs font-semibold text-primary-foreground tracking-wider hover:opacity-90 disabled:opacity-40 transition-opacity"
              @click="openAttempt(recipe)"
            >
              <Dices class="h-3.5 w-3.5" />
              Attempt Craft
            </button>
          </div>
        </div>
      </div>
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
import { generateHTML } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { CheckCircle, Dices, LayoutList, XCircle } from "lucide-vue-next";
import PageHeader from "@/components/common/PageHeader.vue";
import CraftAttemptDialog from "@/components/crafting/CraftAttemptDialog.vue";
import { CRAFTING_DISCIPLINES, getDiscipline } from "@/lib/crafting-disciplines";
import type { DisciplineConfig } from "@/lib/crafting-disciplines";
import { usePlayerCraftingRecipes, useRecipeIngredients, useRecipeModifiers, useRecipeOutputs } from "@/composables/useCrafting";
import { useItems } from "@/composables/useItems";
import { useParty } from "@/composables/useParty";
import { usePartyInventory } from "@/composables/usePartyInventory";
import { useAuthStore } from "@/stores/auth";
import { useUiStore } from "@/stores/ui";
import type { CraftingRecipe, CraftingDiscipline, CraftingIngredient, CraftingModifier, CraftingOutput, CraftingAttemptResult } from "@/types/crafting.types";

const auth = useAuthStore();
const ui = useUiStore();
const { data: recipes } = usePlayerCraftingRecipes();
const { data: allItems } = useItems();
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

// Check tool proficiency on character — any accepted tool counts
function hasProficiency(tools: string[]): boolean {
  return tools.some((t) => member.value?.tool_proficiencies?.includes(t) ?? false);
}

// Check if player has any accepted tool in inventory
function hasTools(tools: string[]): boolean {
  return tools.some((tool) =>
    myInventory.value.some(
      (inv) => inv.name.toLowerCase().includes(tool.toLowerCase()) && !inv.is_ruined,
    ),
  );
}

const disciplineRecipes = computed(() =>
  ui.playerCraftingActiveTab === "all"
    ? (recipes.value ?? [])
    : (recipes.value ?? []).filter((r) => r.discipline === ui.playerCraftingActiveTab),
);

// Cache ingredient/modifier/output fetches per recipe
const ingredientCache = new Map<string, ReturnType<typeof useRecipeIngredients>>();
const modifierCache = new Map<string, ReturnType<typeof useRecipeModifiers>>();
const outputCache = new Map<string, ReturnType<typeof useRecipeOutputs>>();

function ingredientsFor(recipeId: string): CraftingIngredient[] {
  if (!ingredientCache.has(recipeId)) {
    ingredientCache.set(recipeId, useRecipeIngredients(recipeId));
  }
  return ingredientCache.get(recipeId)!.data.value ?? [];
}

function modifiersFor(recipeId: string): CraftingModifier[] {
  if (!modifierCache.has(recipeId)) {
    modifierCache.set(recipeId, useRecipeModifiers(recipeId));
  }
  return modifierCache.get(recipeId)!.data.value ?? [];
}

function outputsFor(recipeId: string): CraftingOutput[] {
  if (!outputCache.has(recipeId)) {
    outputCache.set(recipeId, useRecipeOutputs(recipeId));
  }
  return outputCache.get(recipeId)!.data.value ?? [];
}

function itemName(itemId: string): string {
  return allItems.value?.find((i) => i.id === itemId)?.name ?? "Unknown item";
}

function ingredientLabel(ing: CraftingIngredient): string {
  if (ing.item_id) return itemName(ing.item_id);
  if (!ing.tags) return "Any";
  return ing.tags.length === 1 ? `Any "${ing.tags[0]}"` : `Any [${ing.tags.join(" + ")}]`;
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

function tabClass(d: DisciplineConfig) {
  if (ui.playerCraftingActiveTab === d.id) return "border-primary bg-primary/10 text-foreground";
  if (!hasProficiency(d.tools)) return "border-border/60 text-muted-foreground/60 hover:text-muted-foreground hover:border-border/80";
  return "border-border text-muted-foreground hover:text-foreground hover:border-border/80";
}

function renderDescription(content: string | null): string {
  if (!content) return "";
  try {
    return generateHTML(JSON.parse(content), [StarterKit]);
  } catch {
    return content;
  }
}

function openAttempt(recipe: CraftingRecipe) {
  attemptRecipe.value = recipe;
}

function onDone(_result: CraftingAttemptResult) {
  attemptRecipe.value = null;
}
</script>
