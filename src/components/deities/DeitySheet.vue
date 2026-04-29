<template>
  <div class="grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-5">
    <!-- Left: portrait + meta -->
    <div class="flex flex-col gap-4">
      <!-- Divine portrait -->
      <div
        class="relative aspect-3/4 rounded-lg border border-border overflow-hidden bg-muted"
      >
        <FocalImage
          v-if="deity.portrait_url"
          :src="deity.portrait_url"
          :focal-point="deity.portrait_focal_point ?? null"
          :alt="deity.name"
          format="portrait"
          class="w-full h-full"
        />
        <div
          v-else
          class="w-full h-full flex flex-col items-center justify-center gap-2 text-muted-foreground/40"
        >
          <Sun class="h-12 w-12" />
        </div>
      </div>

      <!-- Holy symbol image -->
      <div
        v-if="deity.symbol_image_url"
        class="aspect-square rounded-lg border border-border overflow-hidden bg-muted p-2"
      >
        <img
          :src="deity.symbol_image_url"
          :alt="deity.name + ' holy symbol'"
          class="w-full h-full object-contain"
        />
      </div>

      <div class="flex flex-col gap-3">
        <!-- Pantheon -->
        <div v-if="pantheonName">
          <span
            class="font-cinzel text-[10px] font-semibold tracking-wider text-muted-foreground uppercase"
            >Pantheon</span
          >
          <RouterLink
            v-if="deity.pantheon_id"
            :to="`/pantheons/${deity.pantheon_id}`"
            class="block font-fell text-sm text-primary hover:underline"
            >{{ pantheonName }}</RouterLink
          >
          <p v-else class="font-fell text-sm text-foreground">
            {{ pantheonName }}
          </p>
        </div>

        <!-- Alignment -->
        <div v-if="deity.alignment">
          <span
            class="font-cinzel text-[10px] font-semibold tracking-wider text-muted-foreground uppercase"
            >Alignment</span
          >
          <p class="font-fell text-sm text-foreground">{{ deity.alignment }}</p>
        </div>

        <!-- Holy symbol description -->
        <div v-if="deity.symbol">
          <span
            class="font-cinzel text-[10px] font-semibold tracking-wider text-muted-foreground uppercase"
            >Holy Symbol</span
          >
          <p class="font-fell text-sm text-foreground">{{ deity.symbol }}</p>
        </div>

        <!-- Portfolio -->
        <div v-if="deity.portfolio">
          <span
            class="font-cinzel text-[10px] font-semibold tracking-wider text-muted-foreground uppercase"
            >Portfolio</span
          >
          <p class="font-fell text-sm text-foreground">{{ deity.portfolio }}</p>
        </div>

        <!-- Domains -->
        <div v-if="deity.domains?.length">
          <span
            class="font-cinzel text-[10px] font-semibold tracking-wider text-muted-foreground uppercase"
            >Cleric Domains</span
          >
          <div class="flex flex-wrap gap-1 mt-1">
            <span
              v-for="domain in deity.domains"
              :key="domain"
              class="font-cinzel text-[10px] tracking-wider bg-primary/10 text-primary rounded px-2 py-0.5 border border-primary/20"
              >{{ domain }}</span
            >
          </div>
        </div>

        <!-- Alternate names -->
        <div v-if="deity.alternate_names?.length">
          <span
            class="font-cinzel text-[10px] font-semibold tracking-wider text-muted-foreground uppercase"
            >Also Known As</span
          >
          <div class="flex flex-wrap gap-1 mt-1">
            <span
              v-for="alt in deity.alternate_names"
              :key="alt"
              class="font-cinzel text-[10px] tracking-wider bg-muted/60 text-muted-foreground rounded px-2 py-0.5"
              >{{ alt }}</span
            >
          </div>
        </div>

        <!-- Tags -->
        <div v-if="deity.tags?.length">
          <span
            class="font-cinzel text-[10px] font-semibold tracking-wider text-muted-foreground uppercase"
            >Tags</span
          >
          <div class="flex flex-wrap gap-1 mt-1">
            <span
              v-for="tag in deity.tags"
              :key="tag"
              class="font-cinzel text-[10px] tracking-wider bg-muted/60 text-muted-foreground rounded px-2 py-0.5"
              >{{ tag }}</span
            >
          </div>
        </div>
      </div>
    </div>

    <!-- Right: name + content + actions -->
    <div class="flex flex-col gap-4">
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0 flex-1">
          <h1
            class="font-cinzel text-2xl font-bold text-foreground leading-tight"
          >
            {{ deity.name }}
          </h1>
          <p
            v-if="deity.titles"
            class="font-fell text-sm text-muted-foreground italic mt-0.5"
          >
            {{ deity.titles }}
          </p>
        </div>
        <div class="flex items-center gap-2 shrink-0">
          <button
            type="button"
            class="inline-flex items-center gap-1.5 rounded-md border border-destructive px-3 py-2 font-cinzel text-xs font-semibold text-destructive hover:bg-destructive/10 transition-colors"
            @click="handleDelete"
          >
            <Trash2 class="h-3.5 w-3.5" />
            Delete
          </button>
          <button
            type="button"
            class="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 font-cinzel text-xs font-semibold text-primary-foreground tracking-wider hover:opacity-90 transition-opacity"
            @click="router.push({ query: { ...route.query, edit: 'true' } })"
          >
            <Pencil class="h-3.5 w-3.5" />
            Edit
          </button>
        </div>
      </div>

      <div v-if="hasDescription">
        <RichTextViewer :content="deity.description" />
      </div>
      <p v-else class="font-fell text-sm text-muted-foreground italic">
        No lore recorded for this deity.
      </p>

      <!-- DM secrets block -->
      <div v-if="hasDmNotes" class="border-t border-border pt-4">
        <p
          class="font-cinzel text-[10px] font-semibold tracking-wider text-muted-foreground uppercase mb-2"
        >
          DM Secrets
        </p>
        <RichTextViewer :content="deity.dm_notes" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { RouterLink, useRoute, useRouter } from "vue-router";
import { Pencil, Sun, Trash2 } from "lucide-vue-next";
import { useConfirm } from "@/composables/useConfirm";
import { useDeleteDeity } from "@/composables/useDeities";
import type { Deity, Pantheon } from "@/types/deity.types";
import FocalImage from "@/components/common/FocalImage.vue";
import RichTextViewer from "@/components/common/RichTextViewer.vue";

const props = defineProps<{
  deity: Deity & { pantheon: Pick<Pantheon, "id" | "name"> | null };
}>();
const route = useRoute();
const router = useRouter();
const { confirm } = useConfirm();

const deleteDeity = useDeleteDeity();

const pantheonName = computed(() => props.deity.pantheon?.name ?? null);

async function handleDelete() {
  if (!(await confirm(`Delete "${props.deity.name}"? This cannot be undone.`)))
    return;
  router.push("/deities");
  await deleteDeity.mutateAsync(props.deity.id);
}

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
const hasDmNotes = computed(() => hasContent(props.deity.dm_notes));
</script>
