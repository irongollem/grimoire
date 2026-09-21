<template>
  <div class="space-y-4 rounded-md border border-border bg-background/40 p-3">
    <!-- ── Identity and brief ─────────────────────────────────────────── -->
    <div class="grid gap-3 sm:grid-cols-2">
      <label class="block space-y-1">
        <span class="text-label text-muted-foreground">Name</span>
        <AppInput v-model="name" block maxlength="100" />
      </label>
      <label class="block space-y-1">
        <span class="text-label text-muted-foreground">Sort order</span>
        <AppInput v-model="sortOrder" type="number" block />
      </label>
    </div>

    <label class="block space-y-1">
      <span class="text-label text-muted-foreground">Description</span>
      <!-- Native <textarea> on purpose: this text is the pack's art bible —
           `createGenerationPlan` feeds it straight to the image model — which
           is exactly the AI-prompt case CLAUDE.md exempts from RichTextEditor.
           Markup here would reach the model as content. -->
      <textarea
        v-model="description"
        rows="3"
        maxlength="1000"
        :class="textareaClass"
        placeholder="Materials, motifs, palette, mood…"
      />
      <span class="text-caption-sm text-muted-foreground">
        This is the brief every generation run for this pack is given.
      </span>
    </label>

    <div class="grid gap-3 sm:grid-cols-2">
      <label class="block space-y-1">
        <span class="text-label text-muted-foreground">Licence</span>
        <TagInput v-model="licenseKeys" placeholder="cc0, ogl…" />
      </label>
      <label class="block space-y-1">
        <span class="text-label text-muted-foreground">Attribution source</span>
        <AppSelect v-model="contentSourceKey" block tone="default">
          <option value="">— none —</option>
          <option v-for="source in contentSources" :key="source.key" :value="source.key">
            {{ source.title }}
          </option>
        </AppSelect>
      </label>
    </div>

    <div class="flex flex-wrap items-center gap-2">
      <AppButton
        variant="primary"
        size="sm"
        :icon="IconSave"
        label="Save details"
        :loading="update.isPending.value"
        :disabled="!dirty || !name.trim() || update.isPending.value"
        @click="save"
      />
      <AppButton v-if="dirty" variant="ghost" size="sm" label="Revert" @click="resetForm" />
      <span v-else-if="!update.isPending.value" class="text-caption-sm text-muted-foreground">No unsaved changes.</span>
    </div>

    <!-- ── Coverage and generation ────────────────────────────────────── -->
    <div class="space-y-2 border-t border-border pt-3">
      <div class="flex flex-wrap items-baseline justify-between gap-2">
        <p class="text-label-lg text-foreground">Art</p>
        <p class="text-caption text-muted-foreground">
          {{ counts.drawn }} of {{ counts.declared }} drawn ·
          <span :class="counts.requiredDrawn === counts.required ? 'text-tone-success' : 'text-tone-caution'">
            {{ counts.requiredDrawn }}/{{ counts.required }} required
          </span>
        </p>
      </div>

      <div class="h-1.5 overflow-hidden rounded-full bg-muted">
        <div class="h-full bg-primary transition-[width]" :style="{ width: `${drawnPct}%` }" />
      </div>

      <p v-if="counts.requiredDrawn < counts.required" class="text-caption text-muted-foreground">
        {{ counts.required - counts.requiredDrawn }} required
        {{ counts.required - counts.requiredDrawn === 1 ? "slot" : "slots" }} still blank — this pack cannot be
        published until they are filled.
      </p>

      <div v-if="undrawnAll.length" class="flex flex-wrap items-center gap-2 pt-1">
        <AppButton
          variant="primary"
          size="xs"
          :icon="IconGenerate"
          :label="`Generate ${requiredOnly ? undrawnRequired.length : undrawnAll.length} tiles`"
          :loading="generateMissing.isPending.value"
          :disabled="generateMissing.isPending.value || targetSlotIds.length === 0"
          @click="startGeneration"
        />
        <SegmentedControl v-model="scope" :options="scopeOptions" size="xs" />
        <span class="text-caption-sm text-muted-foreground">Free to generate — real cost is still recorded.</span>
      </div>
      <p v-else class="text-caption text-muted-foreground italic">Every slot in this pack has art.</p>
    </div>

    <!-- ── The slots themselves ───────────────────────────────────────── -->
    <div class="border-t border-border pt-3">
      <LibraryTilePackSlotGrid :pack="pack" />
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * #900 S4 — the editable half of a library tile pack.
 *
 * Three things live here because they are one job: the pack's *brief* (name
 * and description), what its art currently covers, and the button that fills
 * the gaps. Editing the description and generating from it are the same act
 * performed a minute apart — `createGenerationPlan` turns `description`
 * straight into the art bible — so separating them into two surfaces would
 * invite exactly the mistake #900 found in production, where `stone-dungeon`
 * still carried "placeholder-generated until the AI generation pipeline ships
 * M1 assets" as the text any run would have been briefed from.
 *
 * The form is local-until-saved rather than save-on-blur: a half-rewritten
 * art bible is not a state worth persisting, and `update` patches the
 * manifest's own copies of these fields alongside the columns.
 */
import { computed, ref, watch } from "vue";
import { useQuery } from "@tanstack/vue-query";
import AppButton from "@/components/common/AppButton.vue";
import AppInput from "@/components/common/AppInput.vue";
import AppSelect from "@/components/common/AppSelect.vue";
import SegmentedControl from "@/components/common/SegmentedControl.vue";
import TagInput from "@/components/common/TagInput.vue";
import LibraryTilePackSlotGrid from "./LibraryTilePackSlotGrid.vue";
import { IconGenerate, IconSave } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { fieldVariants } from "@/components/common/fieldVariants";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/composables/useToast";
import { describeLibraryPackError, useLibraryTilePacks } from "@/composables/cartographer/useLibraryTilePacks";
import { coverageCounts, undrawnSlotIds } from "@/cartographer/packCoverage";
import type { LibraryTilePack } from "@/cartographer/userPack.types";

const props = defineProps<{ pack: LibraryTilePack }>();

const { update, generateMissing } = useLibraryTilePacks();
const toast = useToast();

const textareaClass = cn(fieldVariants({ tone: "default", size: "body" }), "w-full resize-y min-h-20");

const name = ref("");
const description = ref("");
const sortOrder = ref("");
const licenseKeys = ref<string[]>([]);
const contentSourceKey = ref("");

function resetForm(): void {
  name.value = props.pack.name;
  description.value = props.pack.description;
  sortOrder.value = String(props.pack.sort_order);
  licenseKeys.value = [...props.pack.license_keys];
  // `""` is this select's "none" option; the column is nullable and the two
  // are converted at the boundary in `save()` rather than letting an empty
  // string reach a text column that means something different by it.
  contentSourceKey.value = props.pack.content_source_key ?? "";
}

// `immediate` seeds the form on mount; the watch then re-seeds it whenever the
// row changes underneath — after a save, or after a generation run rewrites
// the manifest — so the editor never shows a stale copy of a field it is not
// currently being edited into.
watch(() => props.pack, resetForm, { immediate: true, deep: true });

const dirty = computed(() =>
  name.value !== props.pack.name
  || description.value !== props.pack.description
  || sortOrder.value !== String(props.pack.sort_order)
  || licenseKeys.value.join(" ") !== props.pack.license_keys.join(" ")
  || contentSourceKey.value !== (props.pack.content_source_key ?? ""),
);

/** The attribution catalogue. Admin-only surface, so an unfiltered read. */
const sourcesQuery = useQuery({
  queryKey: ["content-sources", "picker"],
  queryFn: async () => {
    const { data, error } = await supabase.from("content_sources").select("key, title").order("title");
    if (error) throw error;
    return (data ?? []) as { key: string; title: string }[];
  },
});
const contentSources = computed(() => sourcesQuery.data.value ?? []);

const counts = computed(() => coverageCounts(props.pack.manifest));
const drawnPct = computed(() =>
  counts.value.declared > 0 ? Math.round((counts.value.drawn / counts.value.declared) * 100) : 0,
);

const undrawnAll = computed(() => undrawnSlotIds(props.pack.manifest));
const undrawnRequired = computed(() => undrawnSlotIds(props.pack.manifest, { requiredOnly: true }));

const scope = ref<"required" | "all">("required");
const requiredOnly = computed(() => scope.value === "required");
const targetSlotIds = computed(() => (requiredOnly.value ? undrawnRequired.value : undrawnAll.value));

const scopeOptions = computed(() => [
  { value: "required", label: `Required (${undrawnRequired.value.length})` },
  { value: "all", label: `All blank (${undrawnAll.value.length})` },
]);

async function save(): Promise<void> {
  try {
    await update.mutateAsync({
      packRowId: props.pack.id,
      name: name.value.trim(),
      description: description.value.trim(),
      sortOrder: Number(sortOrder.value),
      licenseKeys: licenseKeys.value,
      contentSourceKey: contentSourceKey.value || null,
    });
    toast.success("Pack details saved.");
  } catch (caught) {
    toast.error(describeLibraryPackError(caught));
  }
}

async function startGeneration(): Promise<void> {
  try {
    const result = await generateMissing.mutateAsync({
      packRowId: props.pack.id,
      slotIds: targetSlotIds.value,
    });
    toast.success(
      result.status === "proof_pending"
        ? `Run started — generate the proof tiles, then approve the style.`
        : `Run started — ${result.total_jobs} tiles queued.`,
    );
  } catch (caught) {
    toast.error(describeLibraryPackError(caught));
  }
}
</script>
