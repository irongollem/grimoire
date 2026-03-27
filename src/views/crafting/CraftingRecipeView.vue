<template>
  <PageHeader :title="isNew ? 'New Recipe' : (recipe?.name || 'Loading…')">
    <RecipeEditor :recipe="recipe ?? undefined" @saved="onSaved" />
  </PageHeader>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import PageHeader from "@/components/common/PageHeader.vue";
import RecipeEditor from "@/components/crafting/RecipeEditor.vue";
import { useCraftingRecipe } from "@/composables/useCrafting";

const route = useRoute();
const router = useRouter();

const isNew = computed(() => route.params.id === "new");
const id = computed(() => (isNew.value ? "" : (route.params.id as string)));

const { data: recipe } = useCraftingRecipe(id.value);

function onSaved(_savedId: string) {
  router.push("/crafting");
}
</script>
