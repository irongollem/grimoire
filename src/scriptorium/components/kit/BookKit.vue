<template>
  <nav aria-label="Book kit" class="flex min-h-0 w-full flex-1 flex-col overflow-y-auto" data-testid="book-kit">
    <section class="flex flex-col gap-2 px-3.5 pt-3.5 pb-3">
      <h2 class="text-eyebrow uppercase text-muted-foreground">Blocks · drag onto the page</h2>
      <div class="grid grid-cols-3 gap-1.5">
        <KitTile
          v-for="entry in featured"
          :key="entry.label"
          :label="entry.kit ?? entry.label"
          :icon="entry.icon"
          :tooltip="blockBlurb(entry)"
          :disabled="blocked(entry)"
          @place="placeBlock(entry)"
          @dragstart="startKitDrag($event, { kind: 'block', label: entry.label })"
          @dragend="endKitDrag"
        />
      </div>

      <AppButton
        variant="link"
        size="sm"
        class="self-start"
        :label="moreOpen ? 'Fewer blocks' : 'More blocks'"
        :aria-expanded="moreOpen"
        @click="moreOpen = !moreOpen"
      />
      <div v-if="moreOpen" class="flex flex-col gap-3" data-testid="kit-more">
        <div v-for="group in moreGroups" :key="group.name" class="flex flex-col gap-0.5">
          <h3 class="text-eyebrow uppercase text-muted-foreground">{{ group.name }}</h3>
          <AppButton
            v-for="entry in group.entries"
            :key="entry.label"
            variant="menu"
            size="body"
            block
            class="cursor-grab"
            :draggable="!blocked(entry)"
            :disabled="blocked(entry)"
            :tooltip="blockBlurb(entry)"
            @click="placeBlock(entry)"
            @dragstart="startKitDrag($event, { kind: 'block', label: entry.label })"
            @dragend="endKitDrag"
          >
            <template #icon><component :is="entry.icon" class="size-4 shrink-0 text-primary" aria-hidden="true" /></template>
            <span class="min-w-0 truncate text-caption text-foreground">{{ entry.label }}</span>
          </AppButton>
        </div>
      </div>
    </section>

    <section class="flex flex-col gap-2 border-t border-border px-3.5 py-3">
      <h2 class="text-eyebrow uppercase text-muted-foreground">From the campaign</h2>
      <AppInput
        ref="searchRef"
        v-model="search"
        type="search"
        size="sm"
        block
        placeholder="Search the campaign"
        aria-label="Search the campaign"
        data-testid="kit-search"
      />
      <p v-if="isLoading && entries.length === 0" class="text-caption italic text-muted-foreground">Loading…</p>
      <p v-else-if="listed.shown.length === 0" class="text-caption italic text-muted-foreground">
        {{ search ? "Nothing by that name." : "Nothing in this campaign yet." }}
      </p>
      <ul v-else class="flex flex-col gap-0.5">
        <li v-for="entry in listed.shown" :key="`${entry.type}:${entry.id}`">
          <AppButton
            variant="menu"
            size="body"
            block
            class="cursor-grab justify-between gap-2"
            draggable="true"
            :data-testid="`kit-entry-${entry.name}`"
            @click="placeEntry(entry)"
            @dragstart="startKitDrag($event, { kind: 'entity', entityType: entry.type, entityId: entry.id, name: entry.name })"
            @dragend="endKitDrag"
          >
            <span class="flex min-w-0 flex-col text-left">
              <span class="truncate text-body text-foreground">{{ entry.name }}</span>
              <span v-if="entry.subtitle" class="truncate text-caption italic text-muted-foreground">{{ entry.subtitle }}</span>
            </span>
            <span class="flex shrink-0 items-center gap-1.5 text-caption text-muted-foreground">
              <span v-if="entry.dot" class="size-2 rounded-full" :style="{ backgroundColor: entry.dot }" aria-hidden="true" data-testid="kit-entry-dot" />
              {{ entityTypeLabel(entry.type) }}
            </span>
          </AppButton>
        </li>
      </ul>
      <p v-if="listed.total > listed.shown.length" class="text-caption italic text-muted-foreground">
        {{ listed.total - listed.shown.length }} more. Type to find one.
      </p>
    </section>

    <section class="flex flex-col gap-2 border-t border-border px-3.5 py-3">
      <h2 class="text-eyebrow uppercase text-muted-foreground">Art</h2>
      <KitArtSection :editor="editor" />
    </section>
  </nav>
</template>

<script setup lang="ts">
/**
 * The book kit (#1176 frame 13): a tab beside Chapters holding every block the
 * book can be written in, and the campaign's entries and art. Each is dragged
 * onto the page where it should go (the page draws a drop line) or clicked to
 * land at the cursor, as the same content either way (`placeKitItem`).
 */
import { computed, nextTick, ref, watch } from "vue";
import { storeToRefs } from "pinia";
import type { Editor } from "@tiptap/core";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import type { AppInputHandle } from "@/components/common/controls/fieldVariants";
import KitArtSection from "@/scriptorium/components/kit/KitArtSection.vue";
import KitTile from "@/scriptorium/components/kit/KitTile.vue";
import { useKitCampaignEntries } from "@/scriptorium/composables/useKitCampaignEntries";
import { BLOCK_GROUP_ORDER, BLOCK_REGISTRY, blockBlurb, featuredBlocks, type BlockEntry } from "@/scriptorium/lib/blockRegistry";
import { filterKitEntries, type KitCampaignEntry } from "@/scriptorium/lib/kit/campaignEntries";
import { endKitDrag, entityTypeLabel, startKitDrag } from "@/scriptorium/lib/kit/kitItem";
import { placeKitItem } from "@/scriptorium/lib/kit/placeKitItem";
import { useScriptoriumUiStore } from "@/scriptorium/stores/ui";

const { editor, isTwoColumn } = defineProps<{
  editor: Editor | undefined;
  isTwoColumn: boolean;
}>();

const featured = featuredBlocks();
const moreOpen = ref(false);
/** Every block the tiles do not show, in the registry's groups. */
const moreGroups = computed(() => {
  const shown = new Set(featured.map((e) => e.label));
  return BLOCK_GROUP_ORDER.map((name) => ({
    name,
    entries: BLOCK_REGISTRY.filter((e) => e.group === name && e.action && !shown.has(e.label)),
  })).filter((g) => g.entries.length > 0);
});

function blocked(entry: BlockEntry): boolean {
  if (!editor) return true;
  return entry.enabled ? !entry.enabled(editor, { isTwoColumn }) : false;
}

function placeBlock(entry: BlockEntry) {
  if (editor) placeKitItem(editor, { kind: "block", label: entry.label }, { isTwoColumn });
}

const { entries, isLoading } = useKitCampaignEntries();
const search = ref("");
const listed = computed(() => filterKitEntries(entries.value, search.value, entityTypeLabel));

function placeEntry(entry: KitCampaignEntry) {
  if (editor) placeKitItem(editor, { kind: "entity", entityType: entry.type, entityId: entry.id, name: entry.name }, { isTwoColumn });
}

const searchRef = ref<AppInputHandle | null>(null);
// The toolbar's "From the campaign" asks through the store: put the cursor in the search. The
// kit may only just have been shown by the same press, so wait for it to be on screen.
const { scriptoriumCampaignSearchAsked: asked } = storeToRefs(useScriptoriumUiStore());
watch(asked, async () => {
  await nextTick();
  searchRef.value?.focus();
});
</script>
