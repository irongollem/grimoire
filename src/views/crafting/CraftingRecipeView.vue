<template>
  <PageHeader :title="isNew ? 'New Recipe' : (recipe?.name || 'Loading…')">
    <template v-if="isNew || isEditing" #actions>
      <button
        v-if="!isNew"
        type="button"
        class="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 font-cinzel text-xs font-semibold text-muted-foreground hover:text-foreground hover:border-muted-foreground/50 transition-colors"
        @click="onCancel"
      >
        Cancel
      </button>
    </template>

    <RecipeSheet v-if="!isNew && !isEditing && recipe" :recipe="recipe" />
    <RecipeEditor v-else :recipe="recipe ?? undefined" @saved="onSaved" />
  </PageHeader>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import PageHeader from "@/components/common/PageHeader.vue";
import RecipeEditor from "@/components/crafting/RecipeEditor.vue";
import RecipeSheet from "@/components/crafting/RecipeSheet.vue";
import { useCraftingRecipe } from "@/composables/useCrafting";

const route = useRoute();
const router = useRouter();

const isNew = computed(() => route.params.id === "new");
const isEditing = computed(() => route.query.edit === "true");
const id = computed(() => (isNew.value ? "" : (route.params.id as string)));

const { data: recipe } = useCraftingRecipe(id);

function onCancel() {
  const q = { ...route.query };
  delete q.edit;
  router.push({ query: q });
}

function onSaved(_savedId: string) {
  router.push("/crafting");
}
</script>
