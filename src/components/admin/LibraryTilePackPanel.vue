<template>
  <div class="rounded-lg border border-border bg-card p-4 space-y-4">
    <div class="flex items-start justify-between gap-3">
      <div>
        <p class="text-eyebrow text-muted-foreground">Library Sets</p>
        <h2 class="mt-0.5 font-cinzel text-sm font-semibold tracking-wide text-foreground">Tile Packs</h2>
        <p class="mt-0.5 text-caption text-muted-foreground italic">
          Shared platform content, published once and available to every DM — no credits charged.
          Tile packs are the first content type this shell hosts; monsters, spells and items will
          follow the same shape.
        </p>
      </div>
      <AppButton
        variant="primary"
        size="sm"
        :icon="IconAdd"
        label="New tile pack"
        @click="creating = !creating"
      />
    </div>

    <div v-if="creating" class="space-y-3 rounded-md border border-border bg-background/40 p-3">
      <p class="text-label-lg uppercase text-muted-foreground">New tile pack</p>
      <label class="block space-y-1">
        <span class="text-label text-muted-foreground">Name</span>
        <AppInput v-model="newName" placeholder="Sunken elven ruins" maxlength="100" />
      </label>
      <label class="block space-y-1">
        <span class="text-label text-muted-foreground">Pack id (optional slug)</span>
        <AppInput v-model="newPackId" placeholder="sunken-elven-ruins" />
      </label>
      <label class="block space-y-1">
        <span class="text-label text-muted-foreground">Description</span>
        <textarea
          v-model="newDescription"
          rows="3"
          maxlength="1000"
          :class="textareaClass"
          placeholder="Materials, motifs, palette, mood…"
        />
      </label>
      <p v-if="createError" class="text-caption text-tone-danger">{{ createError }}</p>
      <div class="flex items-center gap-2">
        <AppButton
          variant="primary"
          size="sm"
          label="Start generation"
          :loading="createRun.isPending.value"
          :disabled="!newName.trim() || createRun.isPending.value"
          @click="submitCreate"
        />
        <AppButton variant="ghost" size="sm" label="Cancel" @click="creating = false" />
      </div>
    </div>

    <div v-if="packsQuery.isPending.value" class="text-caption text-muted-foreground">Loading library sets…</div>
    <p v-else-if="packs.length === 0" class="text-caption text-muted-foreground italic">
      No library tile packs yet — start one above.
    </p>
    <div v-else class="space-y-3">
      <LibraryTilePackRow
        v-for="pack in packs"
        :key="pack.id"
        :pack="pack"
        :run="runForPack(pack.id)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * #889 S4/S5 — the first admin-reachable library **authoring** surface.
 * Framed as a general "library sets" shell (per the 17 Sep 2026 steer) whose
 * first content type is tile packs; monsters/spells/items can plug into the
 * same card later without this surface having been shaped tile-pack-only at
 * the top level.
 *
 * `packs` comes from `useLibraryTilePacks()`; `runs` comes from the
 * lane-agnostic `useTilePacks()` so a library-lane run's progress can be
 * matched to its pack by `library_tile_pack_id` — that composable's own
 * `runs` query embeds `user_tile_packs(*)`, not `library_tile_packs(*)`, so
 * the match happens here against this panel's own `packs` list rather than
 * relying on a relation the shared query never asked for.
 */
import { computed, ref } from "vue";
import AppButton from "@/components/common/AppButton.vue";
import AppInput from "@/components/common/AppInput.vue";
import { IconAdd } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { fieldVariants } from "@/components/common/fieldVariants";
import { useLibraryTilePacks } from "@/composables/cartographer/useLibraryTilePacks";
import { useTilePacks } from "@/composables/cartographer/useTilePacks";
import LibraryTilePackRow from "./LibraryTilePackRow.vue";
import type { TilePackGenerationJob, TilePackGenerationRun } from "@/cartographer/userPack.types";

type RunWithJobs = TilePackGenerationRun & { tile_pack_generation_jobs: TilePackGenerationJob[] };

const { packs: packsQuery, createRun } = useLibraryTilePacks();
const { runs } = useTilePacks();

// Loading state is read from `packsQuery` directly (below); this is purely
// what the list renders, so it never needs to fabricate a value for "not
// loaded yet" the way a domain field would.
const packs = computed(() => packsQuery.data.value ?? []);

function runForPack(packId: string): RunWithJobs | undefined {
  const allRuns = runs.data.value;
  if (!allRuns) return undefined;
  return allRuns.find((candidate) => candidate.library_tile_pack_id === packId);
}

const creating = ref(false);
const newName = ref("");
const newPackId = ref("");
const newDescription = ref("");
const createError = ref("");

const textareaClass = cn(fieldVariants({ tone: "default", size: "body" }), "w-full resize-y min-h-20");

function describeCreateError(caught: unknown): string {
  const message = caught instanceof Error ? caught.message : String(caught);
  if (message === "invalid_pack_id") {
    return 'That pack id isn\'t valid — use lowercase letters, numbers and hyphens, and it can\'t start with "custom-".';
  }
  if (message === "invalid_pack_concept") return "Give the pack a name (a description over 1000 characters won't fit).";
  if (message === "admin_required") return "Only an admin can create library packs.";
  return message;
}

async function submitCreate(): Promise<void> {
  createError.value = "";
  try {
    await createRun.mutateAsync({
      name: newName.value.trim(),
      description: newDescription.value.trim(),
      ...(newPackId.value.trim() ? { packId: newPackId.value.trim() } : {}),
    });
    newName.value = "";
    newPackId.value = "";
    newDescription.value = "";
    creating.value = false;
    // The runs query polls every 5s on its own; refetching now means the new
    // run's progress card appears immediately instead of after a wait.
    await runs.refetch();
  } catch (caught) {
    createError.value = describeCreateError(caught);
  }
}
</script>
