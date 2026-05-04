<template>
  <div>
    <h1 class="font-cinzel text-xl font-bold text-foreground mb-1">Pantheon</h1>
    <p class="font-fell text-sm text-muted-foreground italic mb-6">Gods and divine powers of the world.</p>

    <div v-if="isLoading" class="flex justify-center py-16">
      <LoadingSpinner />
    </div>

    <p
      v-else-if="!visible.length"
      class="text-center font-fell text-sm text-muted-foreground italic py-12"
    >
      No deities have been revealed to you yet.
    </p>

    <template v-else>
      <!-- Filter -->
      <div class="flex flex-wrap items-center gap-2 mb-4">
        <input
          v-model="search"
          type="search"
          placeholder="Filter deities…"
          class="flex-1 min-w-40 bg-card border border-border rounded-md px-3 py-1.5 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>

      <p v-if="!filtered.length" class="font-fell text-sm text-muted-foreground italic text-center py-6">
        No deities match your filter.
      </p>

      <div v-else class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div
          v-for="deity in filtered"
          :key="deity.id"
          class="rounded-lg border border-border bg-card overflow-hidden cursor-pointer hover:border-primary/50 transition-colors"
          @click="toggleDeity(deity)"
        >
          <!-- Card header -->
          <div class="flex items-center gap-3 p-3">
            <div class="relative h-14 w-14 shrink-0 rounded-md border border-border bg-muted overflow-hidden">
              <FocalImage
                v-if="deity.portrait_url"
                :src="deity.portrait_url"
                :focal-point="deity.portrait_focal_point ?? null"
                :alt="deity.name"
                format="portrait"
                class="w-full h-full"
              />
              <div v-else class="w-full h-full flex items-center justify-center text-muted-foreground/30">
                <Sun class="h-6 w-6" />
              </div>
              <span
                v-if="isNew(deity.id, deity.updated_at)"
                class="absolute top-1 left-1 z-10 h-2.5 w-2.5 rounded-full bg-destructive"
                title="New"
              />
            </div>
            <div class="flex-1 min-w-0">
              <h3 class="font-cinzel text-sm font-bold text-foreground truncate">{{ deity.name }}</h3>
              <p v-if="deity.titles" class="font-fell text-xs text-muted-foreground italic truncate">{{ deity.titles }}</p>
              <p v-if="deity.pantheon?.name" class="font-cinzel text-2xs md:text-sm text-muted-foreground tracking-wider mt-0.5">
                {{ deity.pantheon.name }}
              </p>
            </div>
            <ChevronDown
              class="h-4 w-4 shrink-0 text-muted-foreground transition-transform"
              :class="{ 'rotate-180': selected?.id === deity.id }"
            />
          </div>

          <!-- Expanded detail -->
          <div v-if="selected?.id === deity.id" class="border-t border-border p-3 bg-muted/30 flex flex-col gap-3">
            <!-- Symbol image -->
            <div v-if="deity.symbol_image_url" class="flex justify-center">
              <img :src="deity.symbol_image_url" :alt="deity.name + ' symbol'" class="h-16 w-16 object-contain" />
            </div>

            <!-- Meta chips -->
            <div class="flex flex-wrap gap-x-4 gap-y-1 text-xs">
              <div v-if="deity.alignment" class="flex gap-1">
                <span class="font-cinzel text-muted-foreground tracking-wider">Alignment</span>
                <span class="font-fell text-foreground">{{ deity.alignment }}</span>
              </div>
              <div v-if="deity.symbol" class="flex gap-1">
                <span class="font-cinzel text-muted-foreground tracking-wider">Symbol</span>
                <span class="font-fell text-foreground">{{ deity.symbol }}</span>
              </div>
              <div v-if="deity.portfolio" class="flex gap-1">
                <span class="font-cinzel text-muted-foreground tracking-wider">Portfolio</span>
                <span class="font-fell text-foreground">{{ deity.portfolio }}</span>
              </div>
            </div>

            <!-- Domains -->
            <div v-if="deity.domains?.length" class="flex flex-wrap gap-1">
              <span
                v-for="domain in deity.domains"
                :key="domain"
                class="px-1.5 py-0.5 rounded bg-primary/10 border border-primary/20 font-cinzel text-2xs md:text-sm text-primary tracking-wider"
              >{{ domain }}</span>
            </div>

            <!-- Alternate names -->
            <div v-if="deity.alternate_names?.length" class="flex flex-wrap gap-1 text-xs">
              <span class="font-cinzel text-muted-foreground tracking-wider">Also known as:</span>
              <span class="font-fell text-foreground">{{ deity.alternate_names.join(", ") }}</span>
            </div>

            <!-- Description -->
            <RichTextViewer v-if="hasContent(deity.description)" :content="deity.description" />
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { ChevronDown, Sun } from "lucide-vue-next";
import { useAllDeities } from "@/composables/useDeities";
import { useAuthStore } from "@/stores/auth";
import { useReadItems, useMarkRead } from "@/composables/useReadItems";
import type { Deity, Pantheon } from "@/types/deity.types";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import FocalImage from "@/components/common/FocalImage.vue";
import RichTextViewer from "@/components/common/RichTextViewer.vue";

const auth = useAuthStore();
const { data: deities, isLoading } = useAllDeities();
const { isNew } = useReadItems("deity");
const { mutate: markRead } = useMarkRead();

const search   = ref("");
const selected = ref<(Deity & { pantheon: Pick<Pantheon, "id" | "name"> | null }) | null>(null);

const myMemberId = computed(() => auth.linkedPartyMemberId ?? "");

const visible = computed(() =>
  (deities.value ?? []).filter((d) =>
    !!myMemberId.value && (d.player_visible_to ?? []).includes(myMemberId.value),
  ),
);

const filtered = computed(() => {
  const q = search.value.trim().toLowerCase();
  if (!q) return visible.value;
  return visible.value.filter((d) => {
    const haystack = [d.name, d.titles, d.portfolio, ...(d.alternate_names ?? []), ...(d.tags ?? [])]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return haystack.includes(q);
  });
});

function toggleDeity(deity: Deity & { pantheon: Pick<Pantheon, "id" | "name"> | null }) {
  if (selected.value?.id !== deity.id) markRead({ entityType: "deity", entityId: deity.id });
  selected.value = selected.value?.id === deity.id ? null : deity;
}

function hasContent(d: string | null | undefined): boolean {
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
}
</script>
