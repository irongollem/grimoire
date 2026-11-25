<template>
  <PageHeader :title="isNew ? 'New Recipe' : (recipe?.name || 'Loading…')">
    <RecipeSheet v-if="!isNew && !isEditing && recipe" :recipe="recipe" />
    <!-- Not before the recipe arrives: an editor mounted without it would be a new-recipe form. -->
    <RecipeEditor v-else-if="isNew || recipe" :recipe="recipe ?? undefined" @saved="onSaved" @done="onDone" />
  </PageHeader>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import PageHeader from "@/components/common/list/PageHeader.vue";
import RecipeEditor from "@/components/crafting/RecipeEditor.vue";
import RecipeSheet from "@/components/crafting/RecipeSheet.vue";
import { useCraftingRecipe } from "@/composables/crafting/useCrafting";

const route = useRoute();
const router = useRouter();

// /crafting/new is its own route with no :id, so ask the route's name, never params.id.
const isNew = computed(() => route.name === "crafting-new");
const isEditing = computed(() => route.query.edit === "true");
const id = computed(() => (isNew.value ? "" : String(route.params.id)));

const { data: recipe } = useCraftingRecipe(id);

// An existing recipe saves itself, so Done only leaves edit mode.
function onDone() {
  const q = { ...route.query };
  delete q.edit;
  router.push({ query: q });
}

function onSaved(_savedId: string) {
  router.push("/crafting");
}
</script>
