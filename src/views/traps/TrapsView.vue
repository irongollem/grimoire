<template>
  <ListPageLayout
    title="Traproom"
    description="Traps, hazards & dungeon dangers"
  >
    <template #actions>
      <ListActionButton
        :icon="populateMutation.isPending.value ? IconLoading : IconPopulate"
        :label="populateStatusLabel"
        :disabled="populateMutation.isPending.value"
        @click="handlePopulate"
      />
      <ListActionButton
        :icon="IconGenerate"
        label="Generate"
        @click="ui.trapGeneratorOpen = true"
      />
      <ListActionButton
        :icon="IconAdd"
        label="New Trap"
        mobile-label="Trap"
        variant="primary"
        @click="router.push('/traps/new')"
      />
    </template>

    <!--
      Filters moved into the sticky slot so they don't scroll away with the
      grid. Previously they lived inside the default slot above the grid.
    -->
    <template v-if="traps?.length" #filters>
      <ListFilterBar>
        <ListSearchInput v-model="search" placeholder="Search traps…" />
        <ListFilterSelect v-model="typeFilter" aria-label="Trap type filter">
          <option value="">All Types</option>
          <option v-for="t in TRAP_TYPES" :key="t" :value="t">{{ t }}</option>
        </ListFilterSelect>
      </ListFilterBar>
    </template>

    <div v-if="isLoading" class="flex justify-center py-16">
      <LoadingSpinner />
    </div>

    <template v-else-if="traps?.length">
      <p
        v-if="!filtered.length"
        class="text-center font-fell text-sm text-muted-foreground italic py-8"
      >
        No traps match your filter.
      </p>

      <div
        v-else
        class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4"
      >
        <RouterLink
          v-for="trap in filtered"
          :key="trap.id"
          :to="`/traps/${trap.id}`"
          class="flex flex-col rounded-lg border border-border bg-card overflow-hidden hover:border-primary/50 transition-colors group"
        >
          <div class="relative aspect-square bg-muted overflow-hidden shrink-0">
            <FocalImage
              v-if="trap.image_url"
              :src="trap.image_url"
              :alt="trap.name"
              format="portrait"
              :focal-point="trap.image_focal_point"
              class="group-hover:scale-105 transition-transform duration-300"
            />
            <div
              v-else
              class="w-full h-full flex items-center justify-center text-muted-foreground/20"
            >
              <IconTrap class="h-10 w-10" />
            </div>
            <span
              class="absolute top-2 left-2 font-cinzel text-[9px] px-1.5 py-0.5 rounded tracking-wider text-white font-bold"
              :style="{
                backgroundColor: TRAP_TYPE_COLORS[trap.trap_type] + 'DD',
              }"
              >{{ trap.trap_type }}</span
            >
          </div>

          <div class="p-2.5 flex flex-col gap-0.5">
            <h3
              class="font-cinzel text-sm font-bold text-foreground leading-tight truncate"
            >
              {{ trap.name }}
            </h3>
            <div class="flex items-center gap-2">
              <span
                v-if="trap.cr"
                class="font-cinzel text-[10px] text-muted-foreground tracking-wider"
              >
                CR {{ trap.cr }}
              </span>
              <span
                v-if="trap.trigger_type"
                class="font-fell text-[10px] text-muted-foreground italic truncate"
              >
                {{ trap.trigger_type }}
              </span>
            </div>
          </div>
        </RouterLink>
      </div>
    </template>

    <EmptyState
      v-else
      icon="Crosshair"
      title="No traps yet"
      description="Build your first trap — set the trigger, DCs, damage, and CR."
      action-label="New Trap"
      @action="router.push('/traps/new')"
    />
  </ListPageLayout>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { RouterLink, useRouter } from "vue-router";
import { IconAdd, IconGenerate, IconLoading, IconPopulate, IconTrap } from '@/lib/icons';
import { useTraps, usePopulateTraps } from "@/composables/useTraps";
import { useUiStore } from "@/stores/ui";
import { TRAP_TYPES, TRAP_TYPE_COLORS } from "@/types/trap.types";
import ListPageLayout from "@/components/common/ListPageLayout.vue";
import ListActionButton from "@/components/common/ListActionButton.vue";
import ListFilterBar from "@/components/common/ListFilterBar.vue";
import ListFilterSelect from "@/components/common/ListFilterSelect.vue";
import ListSearchInput from "@/components/common/ListSearchInput.vue";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import FocalImage from "@/components/common/FocalImage.vue";
import EmptyState from "@/components/common/EmptyState.vue";

const ui = useUiStore();
const router = useRouter();
const { data: traps, isLoading } = useTraps();

const search = ref("");
const typeFilter = ref("");

const filtered = computed(() => {
  let list = traps.value ?? [];
  if (typeFilter.value)
    list = list.filter((t) => t.trap_type === typeFilter.value);
  const q = search.value.toLowerCase().trim();
  if (q)
    list = list.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        (t.trigger_type ?? "").toLowerCase().includes(q) ||
        t.tags.some((tag) => tag.toLowerCase().includes(q)),
    );
  return list;
});

const populateMutation = usePopulateTraps();
const populateStatus = ref<"idle" | "done" | "uptodate">("idle");
const populatedCount = ref(0);
const populateError = ref<string | null>(null);

const populateStatusLabel = computed(() => {
  if (populateMutation.isPending.value) return "Populating…";
  if (populateError.value) return `Error: ${populateError.value}`;
  if (populateStatus.value === "done")
    return `Added ${populatedCount.value} traps`;
  if (populateStatus.value === "uptodate") return "Already up to date";
  return "Populate Traproom";
});

async function handlePopulate() {
  populateStatus.value = "idle";
  populateError.value = null;
  try {
    const count = await populateMutation.mutateAsync();
    populatedCount.value = count;
    populateStatus.value = count === 0 ? "uptodate" : "done";
  } catch (e) {
    populateError.value = e instanceof Error ? e.message : String(e);
  }
  setTimeout(() => {
    populateStatus.value = "idle";
    populateError.value = null;
  }, 8000);
}
</script>
