<template>
  <div>
    <div class="flex items-center gap-2 mb-6">
      <button
        class="font-cinzel text-xs text-muted-foreground hover:text-foreground transition-colors"
        @click="$router.push('/crafting')"
      >
        ← Crafting
      </button>
      <span class="text-muted-foreground/40">/</span>
      <span class="font-cinzel text-xs text-foreground">{{ isNew ? "New Recipe" : recipe?.name || "…" }}</span>
    </div>

    <RecipeEditor :recipe="recipe ?? undefined" @saved="onSaved" />
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import RecipeEditor from "@/components/crafting/RecipeEditor.vue";
import { useCraftingRecipe } from "@/composables/useCrafting";

const route = useRoute();
const router = useRouter();

const isNew = computed(() => route.params.id === "new");
const id = computed(() => (isNew.value ? "" : (route.params.id as string)));

const { data: recipe } = useCraftingRecipe(id.value);

function onSaved(savedId: string) {
  if (isNew.value) {
    router.replace(`/crafting/${savedId}`);
  }
}
</script>
