<template>
  <ListPageLayout
    title="Workshop"
    description="Create recipes and share them with your players"
  >
    <template #title-suffix>
      <ManualHelpLink page="workshop-overview" />
    </template>

    <template #actions>
      <AppButton
        v-if="auth.isDM && playerIds.length"
        variant="outline"
        size="md"
        collapse-label-on-mobile
        :icon="revealAllPending ? IconLoading : IconReveal"
        label="Reveal All"
        :disabled="revealAllPending"
        @click="revealAllRecipes"
      />
      <AppButton
        variant="outline"
        size="md"
        collapse-label-on-mobile
        :icon="importMutation.isPending.value ? IconLoading : IconDownload"
        :label="importStatusLabel"
        :disabled="importMutation.isPending.value"
        @click="handleImport"
      />
      <AppButton
        variant="primary"
        size="md"
        collapse-label-on-mobile
        :icon="IconAdd"
        label="New Recipe"
        to="/crafting/new"
      />
    </template>

    <!-- Discipline tabs (body content) -->
    <div class="flex flex-wrap gap-1 mb-6 rounded-md border border-border p-1 bg-muted w-fit max-w-full overflow-x-auto">
      <SegmentedControl
        v-model="ui.workshopActiveTab"
        :options="workshopTabOptions"
        size="sm"
      />
    </div>

    <!-- Recipes for active discipline -->
    <div class="flex flex-col gap-4">

      <div v-if="isLoading" class="text-body text-muted-foreground italic">Loading recipes…</div>

      <div v-else-if="disciplineRecipes.length === 0" class="rounded-lg border border-border border-dashed px-6 py-10 text-center">
        <component
          :is="activeDiscipline ? activeDiscipline.icon : IconNavWorkshop"
          class="h-8 w-8 text-muted-foreground/40 mx-auto mb-3"
        />
        <p class="font-cinzel text-sm font-semibold text-muted-foreground">
          {{ activeDiscipline ? `No ${activeDiscipline.label} recipes yet` : 'No recipes yet' }}
        </p>
        <p class="text-caption text-muted-foreground/60 italic mt-1">
          {{ activeDiscipline
            ? `Create a recipe to let players craft ${activeDiscipline.label.toLowerCase()} items.`
            : 'Create a recipe to get started.' }}
        </p>
      </div>

      <div v-else class="grid gap-3">
        <!--
          Recipe card restructured so it can't grow wider than its
          container. Previously the name + tag pills sat in a single flex
          row with no wrap: enough tags (discipline + PROF + TOOLS)
          pushed the whole card past the viewport on mobile.

          New layout: name on its own line (truncates), tags wrap onto a
          second line, meta (DC + time) on a third. On mobile the tag
          labels collapse to their icons via `max-sm:hidden` so a recipe
          with all three tags still fits on one row below the name.
        -->
        <div
          v-for="recipe in disciplineRecipes"
          :key="recipe.id"
          class="rounded-lg border border-border bg-card px-4 py-3 flex items-start gap-3 hover:border-border/80 transition-colors"
        >
          <!-- Left: name + tags + meta -->
          <div class="flex-1 min-w-0">
            <p class="font-cinzel text-sm font-bold text-foreground truncate">{{ recipe.name }}</p>

            <div
              v-if="!activeDiscipline || recipe.requires_proficiency || recipe.requires_tools"
              class="flex flex-wrap items-center gap-1.5 mt-1"
            >
              <span
                v-if="!activeDiscipline"
                class="inline-flex items-center gap-1 shrink-0 text-label px-1.5 py-0.5 rounded bg-muted text-muted-foreground"
                :title="getDiscipline(recipe.discipline).label"
              >
                <component :is="getDiscipline(recipe.discipline).icon" class="h-3 w-3" />
                <span class="max-sm:hidden">{{ getDiscipline(recipe.discipline).label }}</span>
              </span>
              <span
                v-if="recipe.requires_proficiency"
                class="inline-flex items-center gap-1 shrink-0 text-label px-1.5 py-0.5 rounded border border-destructive/40 text-destructive bg-destructive/10"
                title="Requires tool proficiency"
              >
                <IconAward class="h-3 w-3" />
                <span class="max-sm:hidden">PROF</span>
              </span>
              <span
                v-if="recipe.requires_tools"
                class="inline-flex items-center gap-1 shrink-0 text-label px-1.5 py-0.5 rounded border border-destructive/40 text-destructive bg-destructive/10"
                title="Requires physical tools"
              >
                <IconTool class="h-3 w-3" />
                <span class="max-sm:hidden">TOOLS</span>
              </span>
            </div>

            <p class="text-caption text-muted-foreground mt-1">
              DC {{ recipe.dc }} · {{ recipe.crafting_time }} {{ recipe.crafting_time !== 1 ? recipe.crafting_time_unit : recipe.crafting_time_unit.replace(/s$/, '') }}
            </p>
          </div>

          <!-- Actions -->
          <div class="flex items-center gap-1 shrink-0" @click.stop>
            <PlayerVisibilityToggle
              :visible-to="recipe.player_visible_to"
              @update:visible-to="onVisibilityChange(recipe, $event)"
            />
            <button
              class="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              title="Edit recipe"
              @click="$router.push(`/crafting/${recipe.id}`)"
            >
              <IconEdit class="h-3.5 w-3.5" />
            </button>
            <button
              class="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-destructive transition-colors"
              title="Delete recipe"
              @click="remove(recipe)"
            >
              <IconDelete class="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  </ListPageLayout>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";

import { IconAdd, IconAward, IconDelete, IconDownload, IconEdit, IconListView, IconLoading, IconNavWorkshop, IconReveal, IconTool } from '@/lib/icons';
import ListPageLayout from "@/components/common/ListPageLayout.vue";
import ManualHelpLink from "@/components/common/ManualHelpLink.vue";
import AppButton from "@/components/common/AppButton.vue";
import SegmentedControl from "@/components/common/SegmentedControl.vue";
import PlayerVisibilityToggle from "@/components/common/PlayerVisibilityToggle.vue";
import { CRAFTING_DISCIPLINES, getDiscipline } from "@/lib/crafting-disciplines";
import { useCraftingRecipes, useDeleteRecipe, useImportStarterRecipes, useUpdateRecipe, useRevealAllRecipes } from "@/composables/useCrafting";
import { useCampaignMembers } from "@/composables/useCampaignMembers";
import { useConfirm } from "@/composables/useConfirm";
import { useUiStore } from "@/stores/ui";
import { useAuthStore } from "@/stores/auth";
import type { CraftingRecipe } from "@/types/crafting.types";

const ui = useUiStore();
const auth = useAuthStore();

const activeDiscipline = computed(() =>
  ui.workshopActiveTab === "all" ? null : getDiscipline(ui.workshopActiveTab),
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
  ui.workshopActiveTab === "all"
    ? (recipes.value ?? [])
    : (recipes.value ?? []).filter((r) => r.discipline === ui.workshopActiveTab),
);

async function remove(recipe: CraftingRecipe) {
  const ok = await confirm(`Delete "${recipe.name}"? This cannot be undone.`, { title: "Delete Recipe" });
  if (!ok) return;
  await deleteRecipe(recipe.id);
}
</script>
