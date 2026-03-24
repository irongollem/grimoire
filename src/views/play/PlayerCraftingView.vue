<template>
  <PageHeader title="Crafting" description="Your known recipes and craft attempts">

    <div v-if="!member" class="font-fell text-sm text-muted-foreground italic">
      No linked character found.
    </div>

    <template v-else>
      <!-- Discipline tabs -->
      <div class="flex flex-wrap gap-1 mb-6 overflow-x-auto pb-1">
        <button
          v-for="d in CRAFTING_DISCIPLINES"
          :key="d.id"
          class="flex items-center gap-1.5 px-3 py-2 rounded-md border font-cinzel text-xs tracking-wide transition-colors shrink-0"
          :class="tabClass(d)"
          :disabled="!hasProficiency(d.tool)"
          :title="!hasProficiency(d.tool) ? `Requires ${d.tool} proficiency` : d.label"
          @click="hasProficiency(d.tool) && (activeTab = d.id)"
        >
          <component :is="d.icon" class="h-3.5 w-3.5" />
          {{ d.label }}
          <span v-if="!hasProficiency(d.tool)" class="font-cinzel text-[9px] text-muted-foreground/50 tracking-wider">LOCKED</span>
        </button>
      </div>

      <!-- Discipline description -->
      <p class="font-fell text-sm text-muted-foreground italic mb-5">
        {{ activeDiscipline.description }}
        <span class="not-italic ml-1">
          Uses <span class="font-semibold text-foreground">{{ activeDiscipline.ability.toUpperCase() }}</span>
          ({{ abilityMod >= 0 ? "+" : "" }}{{ abilityMod }}) +
          Proficiency (+{{ member.proficiency_bonus }}).
        </span>
      </p>

      <!-- Recipes -->
      <div v-if="disciplineRecipes.length === 0" class="rounded-lg border border-border border-dashed px-6 py-10 text-center">
        <component :is="activeDiscipline.icon" class="h-8 w-8 text-muted-foreground/40 mx-auto mb-3" />
        <p class="font-cinzel text-sm font-semibold text-muted-foreground">No recipes known</p>
        <p class="font-fell text-xs text-muted-foreground/60 italic mt-1">
          Your DM can share {{ activeDiscipline.label.toLowerCase() }} recipes with you.
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
              <p class="font-cinzel text-sm font-bold text-foreground truncate">{{ recipe.name }}</p>
              <p class="font-fell text-xs text-muted-foreground">
                DC {{ recipe.dc }} · {{ recipe.crafting_time_days }} day{{ recipe.crafting_time_days !== 1 ? "s" : "" }}
                <span v-if="outputItem(recipe.output_item_id)"> · → {{ outputItem(recipe.output_item_id)?.name }}</span>
              </p>
            </div>
            <span
              v-if="!hasTools(activeDiscipline.tool)"
              class="shrink-0 font-cinzel text-[9px] tracking-wider px-1.5 py-0.5 rounded border border-gold-500/40 text-gold-400 bg-gold-500/10"
              title="No tool in inventory — disadvantage"
            >
              DISADV
            </span>
          </div>

          <!-- Description -->
          <p v-if="recipe.description" class="px-4 pt-3 font-fell text-sm text-muted-foreground italic">
            {{ recipe.description }}
          </p>

          <!-- Ingredients -->
          <div class="px-4 py-3 flex-1">
            <p class="font-cinzel text-[10px] font-semibold tracking-wider text-muted-foreground mb-2">INGREDIENTS</p>
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
              <span class="font-fell text-xs text-foreground flex-1 truncate">
                {{ itemName(ing.item_id) }}
              </span>
              <span class="font-cinzel text-[10px] text-muted-foreground shrink-0">
                {{ ownedCount(ing.item_id) }}/{{ ing.quantity }}
              </span>
            </div>
            <p v-if="ingredientsFor(recipe.id).length === 0" class="font-fell text-xs text-muted-foreground italic">
              No ingredients required.
            </p>
          </div>

          <!-- Attempt button -->
          <div class="px-4 py-3 border-t border-border">
            <button
              :disabled="!canCraft(recipe.id)"
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
      v-if="attemptRecipe && member"
      :open="!!attemptRecipe"
      :recipe="attemptRecipe"
      :required-ingredients="ingredientsFor(attemptRecipe.id)"
      :modifiers="modifiersFor(attemptRecipe.id)"
      :inventory="myInventory"
      :all-items="allItems ?? []"
      :member="member"
      :has-tools="hasTools(activeDiscipline.tool)"
      @close="attemptRecipe = null"
      @done="onDone"
    />
  </PageHeader>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { CheckCircle, Dices, XCircle } from "lucide-vue-next";
import PageHeader from "@/components/common/PageHeader.vue";
import CraftAttemptDialog from "@/components/crafting/CraftAttemptDialog.vue";
import { CRAFTING_DISCIPLINES, getDiscipline } from "@/lib/crafting-disciplines";
import type { DisciplineConfig } from "@/lib/crafting-disciplines";
import { usePlayerCraftingRecipes, useRecipeIngredients, useRecipeModifiers } from "@/composables/useCrafting";
import { useItems } from "@/composables/useItems";
import { useParty } from "@/composables/useParty";
import { usePartyInventory } from "@/composables/usePartyInventory";
import { useAuthStore } from "@/stores/auth";
import { useUiStore } from "@/stores/ui";
import type { CraftingRecipe, CraftingDiscipline, CraftingIngredient, CraftingModifier, CraftingAttemptResult } from "@/types/crafting.types";

const auth = useAuthStore();
const ui = useUiStore();
const { data: recipes } = usePlayerCraftingRecipes();
const { data: allItems } = useItems();
const { data: partyMembers } = useParty();
const { data: inventory } = usePartyInventory();

const activeTab = ref<CraftingDiscipline>("smithing");
const activeDiscipline = computed(() => getDiscipline(activeTab.value));
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

// Ability modifier for active discipline
const abilityMod = computed(() => {
  if (!member.value) return 0;
  const score = member.value[activeDiscipline.value.ability];
  return Math.floor((score - 10) / 2);
});

// Check tool proficiency on character
function hasProficiency(tool: string): boolean {
  return member.value?.tool_proficiencies?.includes(tool) ?? false;
}

// Check if player has the physical tool item in inventory
function hasTools(tool: string): boolean {
  return myInventory.value.some(
    (inv) => inv.name.toLowerCase().includes(tool.toLowerCase()) && !inv.is_ruined,
  );
}

const disciplineRecipes = computed(() =>
  (recipes.value ?? []).filter((r) => r.discipline === activeTab.value),
);

// Cache ingredient/modifier fetches per recipe
const ingredientCache = new Map<string, ReturnType<typeof useRecipeIngredients>>();
const modifierCache = new Map<string, ReturnType<typeof useRecipeModifiers>>();

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

function itemName(itemId: string): string {
  return allItems.value?.find((i) => i.id === itemId)?.name ?? "Unknown item";
}

function outputItem(itemId: string | null) {
  if (!itemId) return null;
  return allItems.value?.find((i) => i.id === itemId) ?? null;
}

function ownedCount(itemId: string): number {
  return myInventory.value
    .filter((i) => i.item_id === itemId && !i.is_ruined)
    .reduce((sum, i) => sum + i.quantity, 0);
}

function hasEnough(ing: CraftingIngredient): boolean {
  return ownedCount(ing.item_id) >= ing.quantity;
}

function canCraft(recipeId: string): boolean {
  return ingredientsFor(recipeId).every((ing) => hasEnough(ing));
}

function tabClass(d: DisciplineConfig) {
  const locked = !hasProficiency(d.tool);
  if (locked) return "border-border/40 text-muted-foreground/40 cursor-not-allowed opacity-50";
  if (activeTab.value === d.id) return "border-primary bg-primary/10 text-foreground";
  return "border-border text-muted-foreground hover:text-foreground hover:border-border/80";
}

function openAttempt(recipe: CraftingRecipe) {
  attemptRecipe.value = recipe;
}

function onDone(_result: CraftingAttemptResult) {
  attemptRecipe.value = null;
}
</script>
