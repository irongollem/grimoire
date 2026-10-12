<template>
  <ListPageLayout
    title="Workshop"
    description="Create recipes and share them with your players"
  >
    <template #title-suffix>
      <ManualHelpLink page="workshop-overview" />
    </template>

    <template #actions>
      <ListActionButton
        v-if="auth.isDM && playerIds.length"
        :icon="IconReveal"
        :loading="revealAllPending"
        label="Reveal All"
        :disabled="revealAllPending"
        @click="revealAllRecipes"
      />
      <ListActionButton
        :icon="IconDownload"
        :loading="importMutation.isPending.value"
        :label="importStatusLabel"
        :disabled="importMutation.isPending.value"
        @click="handleImport"
      />
      <ListActionButton
        v-if="campaign.isAiEnabled"
        :icon="IconGenerate"
        label="Generate"
        @click="generatorsUi.recipeGeneratorOpen = true"
      />
      <ListActionButton
        variant="primary"
        :icon="IconAdd"
        label="New Recipe"
        to="/crafting/new"
      />
      <ListLayoutToggle v-model="layout" />
    </template>

    <!-- Discipline tabs (body content) -->
    <div class="flex flex-wrap gap-1 mb-6 rounded-md border border-border p-1 bg-muted w-fit max-w-full overflow-x-auto">
      <SegmentedControl
        v-model="craftingUi.workshopActiveTab"
        :options="workshopTabOptions"
        size="sm"
        wrap
      />
    </div>

    <!-- Recipes for active discipline -->
    <div class="flex flex-col gap-4">

      <ListSkeleton v-if="isLoading" :variant="layout === 'grid' ? 'grid' : 'tiles'" :columns="layout === 'grid' ? 4 : 1" :count="6" />

      <div v-else-if="disciplineRecipes.length === 0" class="rounded-lg border border-border border-dashed px-6 py-10 text-center">
        <component
          :is="activeDiscipline ? activeDiscipline.icon : IconNavWorkshop"
          class="h-8 w-8 text-muted-foreground/40 mx-auto mb-3"
        />
        <p class="text-heading-sm font-semibold text-muted-foreground">
          {{ activeDiscipline ? `No ${activeDiscipline.label} recipes yet` : 'No recipes yet' }}
        </p>
        <p class="text-caption text-muted-foreground/60 italic mt-1">
          {{ activeDiscipline
            ? `Create a recipe to let players craft ${activeDiscipline.label.toLowerCase()} items.`
            : 'Create a recipe to get started.' }}
        </p>
      </div>

      <EntityCollection
        v-else
        :items="disciplineRecipes"
        :item-key="recipeKey"
        :layout="layout"
        :grid-columns="columns"
        :grid-row-estimate="activeDiscipline ? GRID_ROW_PX : GRID_ROW_WITH_TAGS_PX"
        :row-estimate="activeDiscipline ? ROW_PX : ROW_WITH_TAGS_PX"
      >
        <template #card="{ item: recipe }">
          <EntityTextCard
            :to="`/crafting/${recipe.id}`"
            :title="recipe.name"
            :subtitle="recipeSubtitle(recipe)"
            :fallback-icon="getDiscipline(recipe.discipline).icon"
            :tags="recipeTags(recipe)"
          >
            <template #actions>
              <AudienceRevealControl
                :name="recipe.name"
                :visible-to="recipe.player_visible_to"
                @change="onVisibilityChange(recipe, $event)"
              />
              <AppButton
                variant="ghost"
                tone="danger"
                fill="muted"
                size="icon-xs"
                :icon="IconDelete"
                tooltip="Delete recipe"
                @click="remove(recipe)"
              />
            </template>
          </EntityTextCard>
        </template>
        <!--
          The row is EntityListRow: the name on its own line (truncates), the
          DC and time under it, and the discipline / PROF / TOOLS flags as
          wrapping tag pills so a recipe with all three still fits a phone.
          The whole row opens the editor, so there is no separate Edit button.
        -->
        <template #row="{ item: recipe }">
          <EntityListRow
            :to="`/crafting/${recipe.id}`"
            :title="recipe.name"
            :subtitle="recipeSubtitle(recipe)"
            :fallback-icon="getDiscipline(recipe.discipline).icon"
            :tags="recipeTags(recipe)"
            :max-tags="3"
          >
            <template #actions>
              <div class="flex items-center gap-1">
                <AudienceRevealControl
                  :name="recipe.name"
                  :visible-to="recipe.player_visible_to"
                  @change="onVisibilityChange(recipe, $event)"
                />
                <AppButton
                  variant="ghost"
                  tone="danger"
                  fill="muted"
                  size="icon-xs"
                  :icon="IconDelete"
                  tooltip="Delete recipe"
                  @click="remove(recipe)"
                />
              </div>
            </template>
          </EntityListRow>
        </template>
      </EntityCollection>
    </div>
  </ListPageLayout>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";

import { IconAdd, IconDelete, IconDownload, IconGenerate, IconListView, IconNavWorkshop, IconReveal } from '@/lib/icons';
import ListPageLayout from "@/components/common/list/ListPageLayout.vue";
import ListActionButton from "@/components/common/list/ListActionButton.vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import ManualHelpLink from "@/components/common/ManualHelpLink.vue";
import SegmentedControl from "@/components/common/controls/SegmentedControl.vue";
import AudienceRevealControl from "@/components/common/reveal/AudienceRevealControl.vue";
import { CRAFTING_DISCIPLINES, getDiscipline } from "@/lib/crafting/disciplines";
import { useCraftingRecipes, useDeleteRecipe, useImportStarterRecipes, useUpdateRecipe, useRevealAllRecipes } from "@/composables/crafting/useCrafting";
import { useCampaignMembers } from "@/composables/campaign/useCampaignMembers";
import { useConfirm } from "@/composables/useConfirm";
import { useScrollRestore } from "@/composables/useScrollRestore";
import EntityCollection from "@/components/common/list/EntityCollection.vue";
import EntityTextCard from "@/components/common/entity/EntityTextCard.vue";
import EntityListRow from "@/components/common/entity/EntityListRow.vue";
import ListSkeleton from "@/components/common/feedback/ListSkeleton.vue";
import ListLayoutToggle from "@/components/common/list/ListLayoutToggle.vue";
import { useListLayout } from "@/composables/useListLayout";
import { useBreakpointColumns } from "@/composables/useGridColumns";
import { useCraftingUiStore } from "@/stores/ui/crafting";
import { useGeneratorUiStore } from "@/stores/ui/generators";
import { useCampaignStore } from "@/stores/campaign";
import { useAuthStore } from "@/stores/auth";
import type { CraftingRecipe } from "@/types/crafting.types";

const craftingUi = useCraftingUiStore();
const generatorsUi = useGeneratorUiStore();
const campaign = useCampaignStore();
const auth = useAuthStore();

const activeDiscipline = computed(() =>
  craftingUi.workshopActiveTab === "all" ? null : getDiscipline(craftingUi.workshopActiveTab),
);

const workshopTabOptions = computed(() => [
  { value: "all" as const, label: "All", icon: IconListView },
  ...CRAFTING_DISCIPLINES.map((d) => ({ value: d.id, label: d.label, icon: d.icon })),
]);

const { data: recipes, isLoading } = useCraftingRecipes();
const { mutateAsync: deleteRecipe } = useDeleteRecipe();
const { mutateAsync: updateRecipe } = useUpdateRecipe();
const { confirm } = useConfirm();
const { data: members } = useCampaignMembers();

const playerIds = computed(() =>
  (members.value ?? [])
    .filter((m) => m.role === "player" && m.party_member_id !== null)
    .map((m) => m.party_member_id as string),
);

const { mutateAsync: revealAll, isPending: revealAllPending } = useRevealAllRecipes();

async function revealAllRecipes() {
  if (!playerIds.value.length) return;
  await revealAll(playerIds.value);
}

// Persist a visibility change from the list row. The toggle is wrapped in
// `@click.stop` above so clicking inside the popover doesn't navigate to
// the editor.
async function onVisibilityChange(recipe: CraftingRecipe, visibleTo: string[]) {
  await updateRecipe({ id: recipe.id, update: { player_visible_to: visibleTo } });
}

const importMutation = useImportStarterRecipes();
const importStatus = ref<"idle" | "done" | "uptodate">("idle");
const importedCount = ref(0);

const importStatusLabel = computed(() => {
  if (importMutation.isPending.value) return "Importing…";
  if (importStatus.value === "done") return `Imported ${importedCount.value} recipes`;
  if (importStatus.value === "uptodate") return "Already up to date";
  return "Import Starter Recipes";
});

async function handleImport() {
  importStatus.value = "idle";
  const count = await importMutation.mutateAsync();
  importedCount.value = count;
  importStatus.value = count === 0 ? "uptodate" : "done";
  setTimeout(() => { importStatus.value = "idle"; }, 8000);
}

const disciplineRecipes = computed(() =>
  craftingUi.workshopActiveTab === "all"
    ? (recipes.value ?? [])
    : (recipes.value ?? []).filter((r) => r.discipline === craftingUi.workshopActiveTab),
);

// The whole recipe list is in hand, so only the scroll position needs
// restoring; VirtualGrid windows what is mounted. Scroll restore is wired here
// and not on the player Workshop because this list navigates out to
// `/crafting/:id` and back.
useScrollRestore("crafting-recipes");

const recipeKey = (recipe: CraftingRecipe) => recipe.id;

// The page header's toggle writes the same key. Rows is today's look.
const layout = useListLayout("recipes", "rows");
const columns = useBreakpointColumns({ base: 1, sm: 2, lg: 3, xl: 4 });

function recipeSubtitle(recipe: CraftingRecipe): string {
  const unit = recipe.crafting_time !== 1 ? recipe.crafting_time_unit : recipe.crafting_time_unit.replace(/s$/, "");
  return `DC ${recipe.dc} · ${recipe.crafting_time} ${unit}`;
}

// The discipline only needs naming on the "All" tab; the flags always do.
function recipeTags(recipe: CraftingRecipe): string[] {
  const tags: string[] = [];
  if (!activeDiscipline.value) tags.push(getDiscipline(recipe.discipline).label);
  if (recipe.requires_proficiency) tags.push("PROF");
  if (recipe.requires_tools) tags.push("TOOLS");
  return tags;
}

// Row heights before a row is measured (px), in the default Vellum theme: an
// EntityListRow is 2 border + 32 padding (p-4) + the 48 emblem = 82 bare, and
// 98 once a tag line is under the name. A discipline tab only tags recipes
// needing proficiency or tools, so the shorter figure is the common case there.
const ROW_PX = 82;
const ROW_WITH_TAGS_PX = 98;
// Grid card height before it is measured (px). EntityTextCard: 2 border + 32
// padding (p-4) + the 40 emblem header (it outweighs the name 20 and the DC line
// 17) = 74 bare, and 108 with a tag line under it (gap-2 8 + pt-1 4 + chip 22).
// Same split as the rows: a discipline tab only tags PROF / TOOLS recipes.
const GRID_ROW_PX = 74;
const GRID_ROW_WITH_TAGS_PX = 108;

async function remove(recipe: CraftingRecipe) {
  const ok = await confirm(`Delete "${recipe.name}"? This cannot be undone.`, { title: "Delete Recipe" });
  if (!ok) return;
  await deleteRecipe(recipe.id);
}
</script>
