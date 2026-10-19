<template>
  <div class="rounded-lg border border-border bg-card overflow-hidden">
    <div class="px-4 py-2.5 border-b border-border bg-muted/20">
      <span class="text-label-lg font-semibold text-muted-foreground">PICTURE</span>
    </div>
    <div class="p-4 flex flex-col gap-4 sm:flex-row">
      <div class="w-full sm:w-64 shrink-0">
        <ImageUpload
          v-model="imageUrl"
          v-model:focal-point="focalPoint"
          bucket="item-images"
          aspect="landscape"
          show-focal-point
          placeholder="Drop a picture or click to upload"
        />
      </div>

      <!--
        The recipe is drawn with the art of what it makes until the DM sets a
        picture of their own, so say which one is showing and how to change it.
      -->
      <div class="flex min-w-0 flex-1 flex-col gap-2">
        <template v-if="!imageUrl && fallback">
          <div class="w-40 overflow-hidden rounded-md border border-border">
            <FocalImage
              :src="fallback.url"
              :alt="fallbackName"
              format="landscape"
              :focal-point="fallback.focalPoint"
              class="aspect-video"
            />
          </div>
          <p class="text-caption text-muted-foreground">
            Showing the art of {{ fallbackName }}. Upload a picture to use your own.
          </p>
        </template>
        <p v-else-if="!imageUrl" class="text-caption text-muted-foreground">
          No picture yet. Add an output with art, or upload a picture of your own.
        </p>
        <p v-else-if="fallback" class="text-caption text-muted-foreground">
          Your picture is shown. Remove it to show the art of {{ fallbackName }} again.
        </p>
        <p v-else class="text-caption text-muted-foreground">Your picture is shown.</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import FocalImage from "@/components/common/media/FocalImage.vue";
import ImageUpload from "@/components/common/media/ImageUpload.vue";
import type { RecipeArt } from "@/lib/crafting/recipeArt";

const imageUrl = defineModel<string | null>({ required: true });
const focalPoint = defineModel<{ x: number; y: number } | null>("focalPoint", { default: null });

defineProps<{
  /** The primary output's art, shown while no picture of the recipe's own is set. */
  fallback: RecipeArt | null;
  /** The primary output's name, for the caption. */
  fallbackName: string;
}>();
</script>
