<template>
  <PageHeader :title="isNew ? 'New Recipe' : (recipe?.name || 'Loading…')">
    <template v-if="isNew || isEditing" #actions>
      <AppButton v-if="!isNew" variant="subtle" size="md" label="Cancel" @click="onCancel" />
    </template>

    <RecipeSheet v-if="!isNew && !isEditing && recipe" :recipe="recipe" />
    <RecipeEditor v-else :recipe="recipe ?? undefined" @saved="onSaved" />
  </PageHeader>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import AppButton from "@/components/common/AppButton.vue";
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
