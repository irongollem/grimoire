<template>
  <div class="grid grid-cols-1 gap-5" :class="!lowArt && 'lg:grid-cols-[15rem_1fr]'">
    <!-- Left: portrait + meta. Low art (#1179, frame 04): the column goes, its facts move to the fact line. -->
    <div v-if="!lowArt" class="flex flex-col gap-4">
      <!-- Divine portrait -->
      <div
        class="relative aspect-3/4 rounded-lg border border-border overflow-hidden bg-muted max-w-150 mx-auto lg:max-w-none"
      >
        <FocalImage
          :src="deity.portrait_url"
          :focal-point="deity.portrait_focal_point ?? null"
          :alt="deity.name"
          format="portrait"
          :render-width="600"
          :lightbox="true"
          record
          :placeholder="placeholderUrl('deity')"
          class="w-full h-full"
          ai-badge="right"
        />
      </div>

      <!-- Holy symbol image -->
      <div
        v-if="deity.symbol_image_url"
        class="relative aspect-square rounded-lg border border-border overflow-hidden bg-muted p-2"
      >
        <img
          :src="deity.symbol_image_url"
          :alt="deity.name + ' holy symbol'"
          class="w-full h-full object-contain"
        />
        <AiImageBadge :src="deity.symbol_image_url" />
      </div>

      <div class="flex flex-col gap-3">
        <!-- Pantheon -->
        <div v-if="pantheonName">
          <span
            class="text-eyebrow font-semibold text-muted-foreground"
            >Pantheon</span
          >
          <RouterLink
            v-if="deity.pantheon_id"
            :to="`/pantheons/${deity.pantheon_id}`"
            class="block text-body text-primary hover:underline"
            >{{ pantheonName }}</RouterLink
          >
          <p v-else class="text-body text-foreground">
            {{ pantheonName }}
          </p>
        </div>

        <!-- Alignment -->
        <div v-if="deity.alignment">
          <span
            class="text-eyebrow font-semibold text-muted-foreground"
            >Alignment</span
          >
          <p class="text-body text-foreground">{{ deity.alignment }}</p>
        </div>

        <!-- Holy symbol description -->
        <div v-if="deity.symbol">
          <span
            class="text-eyebrow font-semibold text-muted-foreground"
            >Holy Symbol</span
          >
          <p class="text-body text-foreground">{{ deity.symbol }}</p>
        </div>

        <!-- Portfolio -->
        <div v-if="deity.portfolio">
          <span
            class="text-eyebrow font-semibold text-muted-foreground"
            >Portfolio</span
          >
          <p class="text-body text-foreground">{{ deity.portfolio }}</p>
        </div>

        <!-- Domains -->
        <div v-if="deity.domains?.length">
          <span
            class="text-eyebrow font-semibold text-muted-foreground"
            >Cleric Domains</span
          >
          <div class="flex flex-wrap gap-1 mt-1">
            <span
              v-for="domain in deity.domains"
              :key="domain"
              class="text-label bg-primary/10 text-primary rounded px-2 py-0.5 border border-primary/20"
              >{{ domain }}</span
            >
          </div>
        </div>

        <!-- Alternate names -->
        <div v-if="deity.alternate_names?.length">
          <span
            class="text-eyebrow font-semibold text-muted-foreground"
            >Also Known As</span
          >
          <div class="flex flex-wrap gap-1 mt-1">
            <span
              v-for="alt in deity.alternate_names"
              :key="alt"
              class="text-label bg-muted/60 text-muted-foreground rounded px-2 py-0.5"
              >{{ alt }}</span
            >
          </div>
        </div>

        <!-- Tags -->
        <div v-if="deity.tags?.length">
          <span
            class="text-eyebrow font-semibold text-muted-foreground"
            >Tags</span
          >
          <div class="flex flex-wrap gap-1 mt-1">
            <span
              v-for="tag in deity.tags"
              :key="tag"
              class="text-label bg-muted/60 text-muted-foreground rounded px-2 py-0.5"
              >{{ tag }}</span
            >
          </div>
        </div>
      </div>
    </div>

    <!-- Right: name + content -->
    <div class="flex flex-col gap-4">
      <div class="relative" :class="lowArt && alignmentTab && 'pr-10'">
        <BookmarkTab
          v-if="lowArt && alignmentTab"
          :text="alignmentTab"
          label="Alignment"
        />
        <h1 class="text-title font-bold text-foreground leading-tight">
          {{ deity.name }}
        </h1>
        <p
          v-if="deity.titles"
          class="text-body text-muted-foreground italic mt-0.5"
        >
          {{ deity.titles }}
        </p>
      </div>

      <SheetFactLine v-if="lowArt" :portrait="deity.portrait_url" :portrait-alt="deity.name">
        <RouterLink v-if="deity.pantheon_id && pantheonName" :to="`/pantheons/${deity.pantheon_id}`" class="text-primary hover:underline">{{ pantheonName }}</RouterLink>
        <span v-else-if="pantheonName" class="text-foreground">{{ pantheonName }}</span>
        <span v-if="deity.alignment && !alignmentTab" class="text-foreground">{{ deity.alignment }}</span>
        <span v-if="deity.symbol" class="text-muted-foreground">Symbol: {{ deity.symbol }}</span>
        <span v-if="deity.portfolio" class="text-muted-foreground">{{ deity.portfolio }}</span>
        <span v-if="deity.domains?.length" class="text-primary">{{ deity.domains.join(" · ") }}</span>
        <span v-if="deity.alternate_names?.length" class="text-muted-foreground">Also known as {{ deity.alternate_names.join(", ") }}</span>
        <span v-if="deity.tags?.length" class="text-muted-foreground">{{ deity.tags.join(", ") }}</span>
      </SheetFactLine>

      <div v-if="hasDescription">
        <RichTextViewer :content="deity.description" />
      </div>
      <p v-else class="text-body text-muted-foreground italic">
        No lore recorded for this deity.
      </p>

      <!-- Who worships, serves or opposes this deity, and its holy sites and relics (#1084). -->
      <div class="border-t border-border pt-4">
        <ConnectionsSection :subject="{ kind: 'deity', id: deity.id }" :subject-name="deity.name" />
      </div>
    </div>
  </div>

</template>

<script setup lang="ts">
import AiImageBadge from "@/components/common/ai/AiImageBadge.vue";
import { computed } from "vue";
import { RouterLink } from "vue-router";
import type { Deity, Pantheon } from "@/types/deity.types";
import FocalImage from "@/components/common/media/FocalImage.vue";
import RichTextViewer from "@/components/common/richtext/RichTextViewer.vue";
import ConnectionsSection from "@/components/connections/ConnectionsSection.vue";
import { placeholderUrl } from "@/lib/placeholderFocalPoints";
import BookmarkTab from "@/components/common/entity/BookmarkTab.vue";
import SheetFactLine from "@/components/common/entity/SheetFactLine.vue";
import { useLowArt } from "@/composables/useLowArt";
import { alignmentAbbreviation } from "@/types/deity.types";

const props = defineProps<{
  deity: Deity & { pantheon: Pick<Pantheon, "id" | "name"> | null };
}>();

const { lowArt } = useLowArt();
const alignmentTab = computed(() => alignmentAbbreviation(props.deity.alignment));
const pantheonName = computed(() => props.deity.pantheon?.name ?? null);

function hasContent(d: string | null | undefined): boolean {
  if (!d) return false;
  try {
    const doc = JSON.parse(d);
    const texts: string[] = [];
    function walk(n: { text?: string; content?: unknown[] }) {
      if (n.text) texts.push(n.text);
      (n.content as (typeof n)[] | undefined)?.forEach(walk);
    }
    walk(doc);
    return texts.join("").trim().length > 0;
  } catch {
    return String(d).trim().length > 0;
  }
}

const hasDescription = computed(() => hasContent(props.deity.description));
</script>
