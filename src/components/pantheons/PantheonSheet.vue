<template>
  <div class="grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-5">
    <!-- Left: emblem + deities in this pantheon -->
    <div class="flex flex-col gap-4">
      <div
        class="relative aspect-square rounded-lg border border-border overflow-hidden bg-muted max-w-150 mx-auto lg:max-w-none"
        :class="pantheon.emblem_url ? 'cursor-zoom-in' : ''"
        @click="pantheon.emblem_url && (lightbox = pantheon.emblem_url)"
      >
        <FocalImage
          v-if="pantheon.emblem_url"
          :src="pantheon.emblem_url"
          :alt="pantheon.name + ' emblem'"
          format="portrait"
          :render-width="600"
          class="w-full h-full"
        />
        <div
          v-else
          class="w-full h-full flex flex-col items-center justify-center gap-2 text-muted-foreground/40"
        >
          <Flame class="h-10 w-10" />
        </div>
      </div>

      <!-- Deity members -->
      <div v-if="memberDeities.length">
        <p class="font-cinzel text-[10px] font-semibold tracking-wider text-muted-foreground uppercase mb-2">Deities</p>
        <div class="flex flex-col gap-1">
          <RouterLink
            v-for="d in memberDeities"
            :key="d.id"
            :to="`/deities/${d.id}`"
            class="flex items-center gap-2 text-sm font-fell text-foreground hover:text-primary transition-colors"
          >
            <Sun class="h-3 w-3 shrink-0 text-muted-foreground" />
            {{ d.name }}
          </RouterLink>
        </div>
      </div>

      <!-- Tags -->
      <div v-if="pantheon.tags?.length">
        <span class="font-cinzel text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">Tags</span>
        <div class="flex flex-wrap gap-1 mt-1">
          <span
            v-for="tag in pantheon.tags"
            :key="tag"
            class="font-cinzel text-[10px] tracking-wider bg-muted/60 text-muted-foreground rounded px-2 py-0.5"
          >{{ tag }}</span>
        </div>
      </div>
    </div>

    <!-- Right: name + description -->
    <div class="flex flex-col gap-4">
      <div>
        <h1 class="font-cinzel text-2xl font-bold text-foreground leading-tight">{{ pantheon.name }}</h1>
      </div>

      <div v-if="hasDescription">
        <RichTextViewer :content="pantheon.description" />
      </div>
      <p v-else class="font-fell text-sm text-muted-foreground italic">
        No description recorded for this pantheon.
      </p>
    </div>
  </div>

  <ImageLightbox :src="lightbox" @close="lightbox = null" />
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { RouterLink } from "vue-router";
import { Flame, Sun } from "lucide-vue-next";
import { useAllDeities } from "@/composables/useDeities";
import type { Pantheon } from "@/types/deity.types";
import FocalImage from "@/components/common/FocalImage.vue";
import RichTextViewer from "@/components/common/RichTextViewer.vue";
import ImageLightbox from "@/components/common/ImageLightbox.vue";

const lightbox = ref<string | null>(null);

const props = defineProps<{ pantheon: Pantheon }>();

const { data: allDeities } = useAllDeities();

const memberDeities = computed(() =>
  (allDeities.value ?? []).filter((d) => d.pantheon_id === props.pantheon.id),
);

const hasDescription = computed(() => {
  const d = props.pantheon.description;
  if (!d) return false;
  try {
    const doc = JSON.parse(d);
    const texts: string[] = [];
    function walk(n: { text?: string; content?: unknown[] }) {
      if (n.text) texts.push(n.text);
      (n.content as typeof n[] | undefined)?.forEach(walk);
    }
    walk(doc);
    return texts.join("").trim().length > 0;
  } catch {
    return String(d).trim().length > 0;
  }
});
</script>
