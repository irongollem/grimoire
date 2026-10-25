<template>
  <PageHeader flush title="Workshop" description="Your known recipes and craft attempts">

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
          :active="craftingUi.playerCraftingActiveTab === 'all'"
          :icon="IconListView"
          label="All"
          @click="craftingUi.playerCraftingActiveTab = 'all'"
        />
        <AppButton
          v-for="d in availableDisciplines"
          :key="d.id"
          variant="subtle"
          size="sm"
          class="shrink-0"
          :class="isTabDimmed(d) ? 'opacity-60' : ''"
          :active="craftingUi.playerCraftingActiveTab === d.id"
          :icon="d.icon"
          :tooltip="!hasProficiency(d.tools) ? `No ${d.tools[0]} proficiency: no proficiency bonus` : d.label"
          @click="craftingUi.playerCraftingActiveTab = d.id"
        >
          <span>{{ d.label }}<span v-if="!hasProficiency(d.tools)" class="text-eyebrow text-muted-foreground/60 ml-1">NO PROF</span></span>
        </AppButton>
      </div>

      <!-- Discipline description (only when a specific discipline is selected) -->
      <div v-if="activeDiscipline" class="mb-5 flex flex-wrap items-start gap-3">
        <AppButton
          variant="subtle"
          size="sm"
          class="order-last"
          :icon="IconSearch"
          label="Experiment"
          :to="{ name: 'play-crafting-experiment', params: { discipline: activeDiscipline.id } }"
        />
        <AppButton
          v-if="inventAvailable"
          variant="subtle"
          size="sm"
          class="order-last"
          :icon="IconWand"
          label="Invent"
          :to="{ name: 'play-crafting-invent', params: { discipline: activeDiscipline.id } }"
        />
        <p class="min-w-0 flex-1 basis-80 text-body text-muted-foreground italic">
          {{ activeDiscipline.description }}
          <span class="not-italic ml-1">
            Uses <span class="font-semibold text-foreground">{{ activeDiscipline.ability.toUpperCase() }}</span>
            ({{ abilityModFor(activeDiscipline) >= 0 ? "+" : "" }}{{ abilityModFor(activeDiscipline) }})
            <template v-if="hasProficiency(activeDiscipline.tools)">
              + Proficiency (+{{ member.proficiency_bonus }}).
            </template>
            <template v-else>
              · <span class="text-gold-400">no proficiency bonus</span>.
            </template>
          </span>
        </p>
      </div>

      <!-- Recipes -->
      <div v-if="disciplineRecipes.length === 0" class="rounded-lg border border-border border-dashed px-6 py-10 text-center">
        <component
          :is="activeDiscipline ? activeDiscipline.icon : IconListView"
          class="h-8 w-8 text-muted-foreground/40 mx-auto mb-3"
        />
        <p class="text-heading-sm font-semibold text-muted-foreground">No recipes known</p>
        <p class="text-caption text-muted-foreground/60 italic mt-1">
          {{ activeDiscipline
            ? `Your DM can share ${activeDiscipline.label.toLowerCase()} recipes with you.`
            : 'Your DM can share recipes with you.' }}
        </p>
      </div>

      <VirtualGrid
        v-else
        :items="disciplineRecipes"
        :item-key="recipeKey"
        :columns="recipeColumns"
        :estimate-row-height="RECIPE_ROW_PX"
        :gap="1"
      >
        <template #default="{ item: recipe }">
        <div
          class="rounded-lg border border-border bg-card flex flex-col overflow-hidden"
        >
          <!-- Every card has the same banner, so a row's height varies only with its text. -->
          <div class="h-28 shrink-0 overflow-hidden bg-muted">
            <FocalImage
              :src="artFor(recipe)?.url ?? null"
              :alt="recipe.name"
              format="landscape"
              :focal-point="artFor(recipe)?.focalPoint ?? null"
              :placeholder="placeholderUrl('item')"
            />
          </div>

          <!-- Card header -->
          <div class="px-4 py-3 border-b border-border bg-muted/20 flex items-start justify-between gap-2">
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 mb-0.5">
                <p class="text-heading-xs font-bold text-foreground truncate">{{ recipe.name }}</p>
                <span
                  v-if="!activeDiscipline"
                  class="shrink-0 text-label px-1.5 py-0.5 rounded bg-muted text-muted-foreground"
                >{{ getDiscipline(recipe.discipline).label }}</span>
              </div>
              <p class="text-caption text-muted-foreground">
                DC {{ recipe.dc }} · {{ recipe.crafting_time }} {{ recipe.crafting_time !== 1 ? recipe.crafting_time_unit : recipe.crafting_time_unit.replace(/s$/, '') }}
                <span v-if="outputsFor(recipe.id).length"> · → {{ outputsFor(recipe.id).map(o => (o.quantity > 1 ? `${o.quantity}× ` : '') + (itemName(inventoryItemRef(o)))).join(', ') }}</span>
              </p>
              <p
                v-if="recipe.requires_tools && !hasTools(getDiscipline(recipe.discipline).tools)"
                class="text-caption text-destructive mt-0.5"
              >Requires {{ getDiscipline(recipe.discipline).tools[0] }}</p>
              <p
                v-else-if="!recipe.requires_tools && !hasTools(getDiscipline(recipe.discipline).tools)"
                class="text-caption text-gold-400 mt-0.5"
              >No {{ getDiscipline(recipe.discipline).tools[0] }}: disadvantage</p>
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
              :title="`Requires ${getDiscipline(recipe.discipline).tools[0]} in inventory: roll at disadvantage`"
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
              v-for="slot in slotsFor(recipe.id)"
              :key="slot.index"
              class="flex items-center gap-2 mb-1"
            >
              <component
                :is="slot.met ? IconCheckCircle : IconCloseCircle"
                class="h-3.5 w-3.5 shrink-0"
                :class="slot.met ? 'text-elven-green' : 'text-destructive'"
              />
              <span class="text-caption text-foreground flex-1 truncate" :class="{ italic: !slot.ref }">
                {{ slot.name }}
              </span>
              <span class="text-label text-muted-foreground shrink-0">
                {{ slot.available }}/{{ slot.needed }}
              </span>
            </div>
            <p v-if="slotsFor(recipe.id).length === 0" class="text-caption text-muted-foreground italic">
              No ingredients required.
            </p>
          </div>

          <!-- The bench itself says what is missing, so the way in is always open. -->
          <div class="px-4 py-3 border-t border-border">
            <AppButton
              variant="primary"
              size="md"
              block
              :icon="IconDiceRoll"
              :to="{ name: 'play-crafting-workbench', params: { recipeId: recipe.id } }"
              label="Open workbench"
            />
          </div>
        </div>
        </template>
      </VirtualGrid>
    </template>

  </PageHeader>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { renderTiptapHtml } from "@/lib/tiptap/renderTiptap";
import { IconCheckCircle, IconCloseCircle, IconDiceRoll, IconListView, IconSearch, IconWand } from '@/lib/icons';
import PageHeader from "@/components/common/list/PageHeader.vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import { CRAFTING_DISCIPLINES, getDiscipline } from "@/lib/crafting/disciplines";
import type { DisciplineConfig } from "@/lib/crafting/disciplines";
import { useInventionAvailable } from "@/composables/crafting/useCraftInventions";
import { usePlayerCrafting } from "@/composables/crafting/usePlayerCrafting";
import FocalImage from "@/components/common/media/FocalImage.vue";
import { placeholderUrl } from "@/lib/placeholderFocalPoints";
import VirtualGrid from "@/components/common/list/VirtualGrid.vue";
import { useBreakpointColumns } from "@/composables/useGridColumns";
import { inventoryItemRef } from "@/lib/itemRef";
import { useCraftingUiStore } from "@/stores/ui/crafting";
import type { CraftingRecipe, CraftingDiscipline } from "@/types/crafting.types";

const craftingUi = useCraftingUiStore();
const inventAvailable = useInventionAvailable();
const { recipes, member, outputsFor, itemName, artFor, hasProficiency, hasTools, slotsFor } = usePlayerCrafting();

// Only disciplines that have at least one accessible recipe
const availableDisciplines = computed(() => {
  const disciplinesWithRecipes = new Set((recipes.value ?? []).map((r) => r.discipline));
  return CRAFTING_DISCIPLINES.filter((d) => disciplinesWithRecipes.has(d.id));
});

const activeDiscipline = computed(() =>
  craftingUi.playerCraftingActiveTab === "all" ? null : getDiscipline(craftingUi.playerCraftingActiveTab as CraftingDiscipline),
);

// Ability modifier for a given discipline
function abilityModFor(discipline: DisciplineConfig): number {
  if (!member.value) return 0;
  const score = member.value[discipline.ability];
  return Math.floor((score - 10) / 2);
}

const disciplineRecipes = computed(() =>
  craftingUi.playerCraftingActiveTab === "all"
    ? (recipes.value ?? [])
    : (recipes.value ?? []).filter((r) => r.discipline === craftingUi.playerCraftingActiveTab),
);

// Windowed rather than mounted whole: a recipe card is ~5ms of mount work (47
// nodes, an AppButton and three glyph components each), so the 184-recipe "All"
// tab once rendered as one unbroken 977ms task, which on a low-end Chromebook
// hung the renderer. Only the rows near the viewport exist now.
// Mirrors the `grid gap-4 sm:grid-cols-2` it replaced.
const recipeColumns = useBreakpointColumns({ base: 1, sm: 2 });
const recipeKey = (recipe: CraftingRecipe) => recipe.id;
// Row height before a row is measured (px): 270-317px across 176 recipes, 295 the median (a card's height follows its ingredient count), measured at a 390px
// phone on 8 Oct 2026 over the dev:campaigns fixture. It decides where a
// restored scroll lands, since coming back from a detail re-renders every
// unmeasured row above the viewport.
const RECIPE_ROW_PX = 295 + 112; // + the h-28 banner (7rem)

// Dims a tab for a discipline the character has no proficiency in — but only
// while it isn't the selected tab, matching the old ternary's precedence.
function isTabDimmed(d: DisciplineConfig): boolean {
  return craftingUi.playerCraftingActiveTab !== d.id && !hasProficiency(d.tools);
}

function renderDescription(content: string | null): string {
  return renderTiptapHtml(content);
}
</script>
