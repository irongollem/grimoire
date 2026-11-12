<template>
  <div data-testid="panel-page">
    <PanelSection>
      <h2 class="text-eyebrow uppercase text-primary">Page</h2>
      <p class="flex items-baseline gap-2 text-foreground">
        <span class="font-fell text-4xl leading-none" data-testid="panel-page-number">{{ description.number }}</span>
        <span v-if="description.of" class="text-body text-muted-foreground">{{ description.of }}</span>
      </p>
      <p v-if="description.where" class="text-body text-muted-foreground" data-testid="panel-page-where">{{ description.where }}</p>
    </PanelSection>

    <PanelSection title="Paper">
      <p class="text-body text-foreground">{{ paperLabel }}</p>
      <AppButton variant="link" size="sm" label="Book settings" class="self-start" @click="emit('openSettings')" />
    </PanelSection>

    <PanelSection title="On this page">
      <p v-if="entries.length === 0" class="text-caption italic text-muted-foreground" data-testid="panel-page-empty">
        Nothing is placed on this page yet.
      </p>
      <ul v-else class="flex flex-col gap-1">
        <li v-for="entry in entries" :key="entry.key">
          <AppButton variant="ghost" size="sm" block class="justify-start" :aria-label="entry.label" @click="emit('select', entry)">
            <img v-if="entry.src" :src="entry.src" alt="" class="size-8 shrink-0 rounded-sm border border-border bg-muted object-cover" />
            <span v-else class="size-8 shrink-0 rounded-sm border border-dashed border-border" aria-hidden="true" />
            <span class="text-body">{{ entry.label }}</span>
          </AppButton>
        </li>
      </ul>
    </PanelSection>

    <PanelSection title="Add to this page">
      <div class="grid grid-cols-2 gap-2">
        <AppButton variant="subtle" size="sm" :icon="IconAddImage" label="Picture" @click="emit('addPicture')" />
        <AppButton variant="subtle" size="sm" label="Blank sheet" data-testid="panel-add-sheet" @click="emit('addSheet')" />
        <AppButton variant="subtle" size="sm" label="Watercolour" @click="emit('addFurniture', 'watercolor')" />
        <AppButton variant="subtle" size="sm" label="Watermark" @click="emit('addFurniture', 'watermark')" />
        <AppButton variant="subtle" size="sm" label="Artist credit" @click="emit('addFurniture', 'artistCredit')" />
      </div>
    </PanelSection>
  </div>
</template>

<script setup lang="ts">
/**
 * The page the caret is on (#1176, frame 02): what page it is in the book,
 * what paper it is printed on, what is placed on it, and what can be added.
 * This is what the panel shows when nothing is selected.
 */
import AppButton from "@/components/common/controls/AppButton.vue";
import PanelSection from "@/scriptorium/components/panel/PanelSection.vue";
import type { PageDescription } from "@/scriptorium/lib/panel/pageInfo";
import type { PageEntry } from "@/scriptorium/lib/panel/onThisPage";
import type { FurnitureKind } from "@/scriptorium/types";
import { IconAddImage } from "@/lib/icons";

defineProps<{
  description: PageDescription;
  paperLabel: string;
  entries: PageEntry[];
}>();
const emit = defineEmits<{
  openSettings: [];
  select: [entry: PageEntry];
  addPicture: [];
  addSheet: [];
  addFurniture: [kind: FurnitureKind];
}>();
</script>
