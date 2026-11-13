<template>
  <div class="grid grid-cols-1 gap-5" :class="!lowArt && 'lg:grid-cols-[15rem_1fr]'">
    <!-- Left: emblem + deities in this pantheon. Low art (#1179, frame 04): the column goes, its facts move to the fact line. -->
    <div v-if="!lowArt" class="flex flex-col gap-4">
      <div
        class="relative aspect-square rounded-lg border border-border overflow-hidden bg-muted max-w-150 mx-auto lg:max-w-none"
      >
        <FocalImage
          v-if="pantheon.emblem_url"
          :src="pantheon.emblem_url"
          :alt="pantheon.name + ' emblem'"
          format="portrait"
          :render-width="600"
          :lightbox="true"
          record
          class="w-full h-full"
          ai-badge="right"
        />
        <div
          v-else
          class="w-full h-full flex flex-col items-center justify-center gap-2 text-muted-foreground/40"
        >
          <IconFire class="h-10 w-10" />
        </div>
      </div>

      <!-- Deity members -->
      <div v-if="memberDeities.length">
        <p class="text-eyebrow font-semibold text-muted-foreground mb-2">Deities</p>
        <div class="flex flex-col gap-1">
          <RouterLink
            v-for="d in memberDeities"
            :key="d.id"
            :to="`/deities/${d.id}`"
            class="flex items-center gap-2 text-body text-foreground hover:text-primary transition-colors"
          >
            <IconSun class="h-3 w-3 shrink-0 text-muted-foreground" />
            {{ d.name }}
          </RouterLink>
        </div>
      </div>

      <!-- Tags -->
      <div v-if="pantheon.tags?.length">
        <span class="text-eyebrow font-semibold text-muted-foreground">Tags</span>
        <div class="flex flex-wrap gap-1 mt-1">
          <span
            v-for="tag in pantheon.tags"
            :key="tag"
            class="text-label bg-muted/60 text-muted-foreground rounded px-2 py-0.5"
          >{{ tag }}</span>
        </div>
      </div>
    </div>

    <!-- Right: name + description -->
    <div class="flex flex-col gap-4">
      <div>
        <h1 class="text-title font-bold text-foreground leading-tight">{{ pantheon.name }}</h1>
      </div>

      <SheetFactLine v-if="lowArt">
        <span v-if="memberDeities.length" class="flex flex-wrap items-center gap-x-3">
          <span class="text-eyebrow font-semibold text-muted-foreground">Deities</span>
          <RouterLink
            v-for="d in memberDeities"
            :key="d.id"
            :to="`/deities/${d.id}`"
            class="text-foreground transition-colors hover:text-primary"
          >{{ d.name }}</RouterLink>
        </span>
        <span v-if="pantheon.tags?.length" class="text-muted-foreground">{{ pantheon.tags.join(", ") }}</span>
        <PortraitOnRequest :src="pantheon.emblem_url" :alt="pantheon.name + ' emblem'" label="Emblem" />
      </SheetFactLine>

      <div v-if="hasDescription">
        <RichTextViewer :content="pantheon.description" />
      </div>
      <p v-else class="text-body text-muted-foreground italic">
        No description recorded for this pantheon.
      </p>
    </div>
  </div>

</template>

<script setup lang="ts">
import { computed } from "vue";
import { RouterLink } from "vue-router";
import { IconFire, IconSun } from '@/lib/icons';
import { useAllDeities } from "@/composables/deities/useDeities";
import type { Pantheon } from "@/types/deity.types";
import FocalImage from "@/components/common/media/FocalImage.vue";
import PortraitOnRequest from "@/components/common/media/PortraitOnRequest.vue";
import SheetFactLine from "@/components/common/entity/SheetFactLine.vue";
import { useLowArt } from "@/composables/useLowArt";
import RichTextViewer from "@/components/common/richtext/RichTextViewer.vue";

const props = defineProps<{ pantheon: Pantheon }>();

const { lowArt } = useLowArt();
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
