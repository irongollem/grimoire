<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { useQuery, useQueryClient } from "@tanstack/vue-query";
import { supabase, getCurrentUser } from "@/lib/supabase";
import { uploadWithVariants, getPublicUrl, BUCKETS } from "@/lib/storage";
import { toWebP } from "@/lib/mediaConvert";
import LibraryArtStagingCard from "@/components/admin/LibraryArtStagingCard.vue";
import LibraryArtUploadPanel from "@/components/admin/LibraryArtUploadPanel.vue";
import LibraryArtListRow from "@/components/admin/LibraryArtListRow.vue";
import LibraryArtPreviewModal from "@/components/admin/LibraryArtPreviewModal.vue";
import LibraryArtTabBar from "@/components/admin/LibraryArtTabBar.vue";
import LibraryArtPanelHeader from "@/components/admin/LibraryArtPanelHeader.vue";
import { useLibraryMonster } from "@/composables/useMonsters";
import { useLibrarySpell } from "@/composables/useSpells";
import type { Monster } from "@/types/monster.types";
import type { Spell } from "@/types/spell.types";

// ── Props & config ────────────────────────────────────────────────────────────

const { mode = "monster" } = defineProps<{ mode?: "monster" | "spell" }>();

// mode never changes at runtime — plain object is sufficient, avoids computed/ref wrapping issues
// canonicalArtTable is the unowned, admin-managed table this panel reads
// and writes (#584) — library_monster_art / library_spell_art now hold only private
// per-DM overrides, which this admin-only panel never touches.
const cfg = mode === "spell"
  ? {
      title: "SRD Spell Art",
      entityTable: "library_spells" as const,
      canonicalArtTable: "library_spell_art_canonical" as const,
      bucket: "spellImages" as const,
      subtitleCol: "school" as const,
      stagingQueryKey: "library-art-staging-spell",
      repairQueryKey: "library-art-repair-list-spells",
      artQueryKey: "library-spell-art",
    }
  : {
      title: "SRD Monster Art",
      entityTable: "library_monsters" as const,
      canonicalArtTable: "library_monster_art_canonical" as const,
      bucket: "monsterImages" as const,
      subtitleCol: "monster_type" as const,
      stagingQueryKey: "library-art-staging-monster",
      repairQueryKey: "library-art-repair-list",
      artQueryKey: "library-monster-art",
    };

// ── Types ─────────────────────────────────────────────────────────────────────

interface LibraryEntityEntry {
  entry_id: string;
  name: string;
  subtitle: string;
  source: string;
  image_url: string | null;
  portrait_focal_point: { x: number; y: number } | null;
  has_user_art: boolean;
}

interface StagingItem {
  id: string;
  storage_path: string;
  image_url: string;
  created_at: string;
}

type RowStatus = "idle" | "uploading" | "done" | "error";
type AssignStatus = "idle" | "assigning" | "done" | "error";

// Staging always lives here regardless of mode. Keyed off the registry so the
// raw storage calls and the public-URL builder cannot disagree about the id.
const STAGING_BUCKET_KEY = "monsterImages" as const;
const STAGING_BUCKET = BUCKETS[STAGING_BUCKET_KEY].id;

// ── State ─────────────────────────────────────────────────────────────────────

const queryClient = useQueryClient();
const panelOpen = ref(false);
const activeTab = ref<"library" | "staging">("staging");

// library
const rowStatuses = ref<Record<string, RowStatus>>({});
const rowErrors = ref<Record<string, string>>({});
const rowDragging = ref<Record<string, boolean>>({});
const rowExpanded = ref<Record<string, boolean>>({});
const rowFocalPoints = ref<Record<string, { x: number; y: number } | null>>({});
const rowUploadedUrls = ref<Record<string, string>>({});

// preview modal
const previewId = ref<string | null>(null);
const previewIdRef = computed(() => previewId.value ?? "");
const { data: previewMonster } = mode === "monster"
  ? useLibraryMonster(previewIdRef)
  : { data: ref<Monster | null>(null) };
const { data: previewSpell } = mode === "spell"
  ? useLibrarySpell(previewIdRef)
  : { data: ref<Spell | null>(null) };

// staging
const stagingDragging = ref(false);
const stagingUploading = ref(false);
const stagingProgress = ref({ total: 0, done: 0 });
const assignStatuses = ref<Record<string, AssignStatus>>({});
const stagingErrors = ref<Record<string, string>>({});
const assignedUrls = ref<Record<string, string>>({});
const stagingSearches = ref<Record<string, string>>({});
const stagingSelected = ref<Record<string, string[]>>({});

// ── Queries ───────────────────────────────────────────────────────────────────

const { data: monsters, isPending: libraryPending } = useQuery({
  queryKey: [cfg.repairQueryKey],
  queryFn: async (): Promise<LibraryEntityEntry[]> => {
    // library_* tables can exceed 1000 rows — paginate past PostgREST's cap
    const PAGE = 1000;
    const [artRes, allEntities] = await Promise.all([
      supabase
        .from(cfg.canonicalArtTable)
        .select("entry_id, image_url, portrait_focal_point")
        .not("image_url", "is", null),
      (async () => {
        const rows: { id: string; name: string; subtitle: string; source: string; image_url: string | null }[] = [];
        let offset = 0;
        while (true) {
          // Explicit selects per table — template literals break Supabase's type parser
          const { data, error } = cfg.entityTable === "library_spells"
            ? await supabase.from("library_spells").select("id, name, school, source, image_url").order("name").range(offset, offset + PAGE - 1)
            : await supabase.from("library_monsters").select("id, name, monster_type, source, image_url").order("name").range(offset, offset + PAGE - 1);
          if (error) throw error;
          (data ?? []).forEach((r) => rows.push({
            id: r.id as string,
            name: r.name as string,
            subtitle: (("school" in r ? r.school : (r as { monster_type?: string }).monster_type) ?? "") as string,
            source: (r.source ?? "") as string,
            image_url: r.image_url as string | null,
          }));
          if ((data ?? []).length < PAGE) break;
          offset += PAGE;
        }
        return rows;
      })(),
    ]);
    if (artRes.error) throw artRes.error;

    const canonicalArtMap = new Map(
      (artRes.data ?? []).map((r) => [
        r.entry_id,
        {
          image_url: r.image_url as string,
          portrait_focal_point: r.portrait_focal_point as { x: number; y: number } | null,
        },
      ]),
    );

    return allEntities
      .map((row) => {
        const canonicalArt = canonicalArtMap.get(row.id);
        return {
          entry_id: row.id,
          name: row.name,
          subtitle: row.subtitle,
          source: row.source,
          image_url: canonicalArt?.image_url ?? row.image_url,
          portrait_focal_point: canonicalArt?.portrait_focal_point ?? null,
          has_user_art: !!canonicalArt,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  },
  staleTime: Infinity,
});

const { data: stagingItems, isPending: stagingPending } = useQuery({
  queryKey: [cfg.stagingQueryKey],
  queryFn: async (): Promise<StagingItem[]> => {
    const { data, error } = await supabase
      .from("library_art_staging")
      .select("id, storage_path, created_at")
      .eq("entity_type", mode)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []).map((row) => ({
      id: row.id as string,
      storage_path: row.storage_path as string,
      created_at: row.created_at as string,
      image_url: getPublicUrl(STAGING_BUCKET_KEY, row.storage_path as string),
    }));
  },
  staleTime: 0,
});

// ── Library: source filter ────────────────────────────────────────────────────

const selectedSource = ref<string | null>(null);

const sources = computed(() =>
  [
    ...new Set((monsters.value ?? []).map((m) => m.source).filter(Boolean)),
  ].sort(),
);

watch(
  sources,
  (list) => {
    if (selectedSource.value === null && list.length > 0) {
      selectedSource.value =
        list.find((s) => /5\.1|core|srd/i.test(s)) ?? list[0];
    }
  },
  { immediate: true },
);

const visibleMonsters = computed(() =>
  (monsters.value ?? []).filter(
    (m) => selectedSource.value === null || m.source === selectedSource.value,
  ),
);

const total = computed(() => visibleMonsters.value.length);
const withArtCount = computed(
  () =>
    visibleMonsters.value.filter(
      (m) => m.has_user_art || rowStatuses.value[m.entry_id] === "done",
    ).length,
);

// ── Library: upload ───────────────────────────────────────────────────────────

async function processFile(entryId: string, file: File) {
  rowStatuses.value[entryId] = "uploading";
  rowErrors.value[entryId] = "";
  try {
    const userId = getCurrentUser()!.id;
    const blob = await toWebP(file);
    const { bucket, canonicalArtTable, entityTable, artQueryKey, repairQueryKey } = cfg;
    // The storage prefix stays "srd" on purpose: #583 renamed the tables but not
    // the 1,193 objects already living under srd/, nor the storage policies
    // keyed on that folder name. Do not "fix" this to match the table names.
    const url = await uploadWithVariants({ bucket, blob, userId, folderPrefix: "srd" });
    if (!url) throw new Error("Upload returned null");

    const { error: artErr } = await supabase
      .from(canonicalArtTable)
      .upsert(
        { entry_id: entryId, image_url: url },
        { onConflict: "entry_id" },
      );
    if (artErr) throw artErr;

    const { error: monErr } = await supabase
      .from(entityTable)
      .update({ image_url: url })
      .eq("id", entryId);
    if (monErr) throw monErr;

    rowUploadedUrls.value[entryId] = url;
    rowStatuses.value[entryId] = "done";
    queryClient.invalidateQueries({ queryKey: [artQueryKey] });
    queryClient.invalidateQueries({ queryKey: [repairQueryKey] });
  } catch (err) {
    rowStatuses.value[entryId] = "error";
    rowErrors.value[entryId] =
      err instanceof Error ? err.message : "Upload failed";
  }
}

async function clearArt(entryId: string) {
  const { canonicalArtTable, entityTable, artQueryKey, repairQueryKey } = cfg;
  await supabase.from(canonicalArtTable).delete().eq("entry_id", entryId);
  await supabase.from(entityTable).update({ image_url: null }).eq("id", entryId);
  delete rowStatuses.value[entryId];
  delete rowUploadedUrls.value[entryId];
  queryClient.invalidateQueries({ queryKey: [artQueryKey] });
  queryClient.invalidateQueries({ queryKey: [repairQueryKey] });
}

// ── Library: drag & drop ──────────────────────────────────────────────────────

function onRowDragEnter(entryId: string, event: DragEvent) {
  event.preventDefault();
  if (rowStatuses.value[entryId] === "uploading") return;
  rowDragging.value[entryId] = true;
}
function onRowDragOver(event: DragEvent) {
  event.preventDefault();
}
function onRowDragLeave(entryId: string, event: DragEvent) {
  const el = event.currentTarget as HTMLElement;
  if (!el.contains(event.relatedTarget as Node))
    rowDragging.value[entryId] = false;
}
function onRowDrop(entryId: string, event: DragEvent) {
  event.preventDefault();
  rowDragging.value[entryId] = false;
  if (rowStatuses.value[entryId] === "uploading") return;
  const file = event.dataTransfer?.files[0];
  if (file) processFile(entryId, file);
}

// ── Library: focal point ──────────────────────────────────────────────────────

function canExpandFocal(m: LibraryEntityEntry) {
  return !!(
    rowUploadedUrls.value[m.entry_id] ?? (m.has_user_art ? m.image_url : null)
  );
}

function toggleFocal(m: LibraryEntityEntry) {
  if (!canExpandFocal(m)) return;
  rowExpanded.value[m.entry_id] = !rowExpanded.value[m.entry_id];
}

async function setFocalPoint(
  m: LibraryEntityEntry,
  fp: { x: number; y: number } | null,
) {
  rowFocalPoints.value[m.entry_id] = fp;
  const imageUrl = rowUploadedUrls.value[m.entry_id] ?? m.image_url!;
  const { canonicalArtTable, artQueryKey } = cfg;
  const { error } = await supabase
    .from(canonicalArtTable)
    .upsert(
      { entry_id: m.entry_id, image_url: imageUrl, portrait_focal_point: fp },
      { onConflict: "entry_id" },
    );
  if (!error) queryClient.invalidateQueries({ queryKey: [artQueryKey] });
}

// ── Staging: upload dump ──────────────────────────────────────────────────────

async function uploadStagingFiles(files: FileList | File[]) {
  const userId = getCurrentUser()!.id;
  const fileArray = Array.from(files);
  stagingUploading.value = true;
  stagingProgress.value = { total: fileArray.length, done: 0 };

  // Process 4 at a time — avoids decoding 60+ full-res iPhone photos simultaneously
  const CONCURRENCY = 4;
  let idx = 0;

  async function worker() {
    while (idx < fileArray.length) {
      const file = fileArray[idx++];
      try {
        const webpFile = await toWebP(file);
        const path = `${userId}/staging/${crypto.randomUUID()}.webp`;
        const { error: storageErr } = await supabase.storage
          .from(STAGING_BUCKET)
          .upload(path, webpFile, { contentType: "image/webp" });
        if (storageErr) throw storageErr;
        const { error: dbErr } = await supabase
          .from("library_art_staging")
          .insert({ user_id: userId, storage_path: path, entity_type: mode });
        if (dbErr) throw dbErr;
      } catch (_) {
        /* individual failure — still advance counter */
      }
      stagingProgress.value.done++;
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  stagingUploading.value = false;
  queryClient.invalidateQueries({ queryKey: [cfg.stagingQueryKey] });
}

// ── Staging: assign ───────────────────────────────────────────────────────────

interface MonsterOption {
  id: string;
  name: string;
  source: string;
}

const monsterOptions = computed<MonsterOption[]>(() =>
  (monsters.value ?? []).map((m) => ({
    id: m.entry_id,
    name: m.name,
    source: m.source,
  })),
);

function toggleStagingSelection(itemId: string, monsterId: string) {
  const cur = stagingSelected.value[itemId] ?? [];
  stagingSelected.value[itemId] = cur.includes(monsterId)
    ? cur.filter((id) => id !== monsterId)
    : [...cur, monsterId];
}

async function assignStagedToSelected(item: StagingItem) {
  const selected = stagingSelected.value[item.id] ?? [];
  if (!selected.length) return;
  assignStatuses.value[item.id] = "assigning";
  stagingErrors.value[item.id] = "";

  try {
    const userId = getCurrentUser()!.id;

    // First assignment fetches + generates variants; subsequent ones reuse the URL
    let url: string | null = assignedUrls.value[item.id];
    if (!url) {
      const response = await fetch(item.image_url);
      if (!response.ok) throw new Error("Could not fetch staged image");
      const fetchedBlob = await response.blob();
      const file = new File([fetchedBlob], "staged.webp", {
        type: "image/webp",
      });
      url = await uploadWithVariants({ bucket: cfg.bucket, blob: file, userId, folderPrefix: "srd" });
      if (!url) throw new Error("Upload returned null");
      assignedUrls.value[item.id] = url!;
    }

    const { canonicalArtTable, entityTable, artQueryKey, repairQueryKey } = cfg;
    await Promise.all(
      selected.map(async (entryId) => {
        const { error: artErr } = await supabase
          .from(canonicalArtTable)
          .upsert(
            { entry_id: entryId, image_url: url },
            { onConflict: "entry_id" },
          );
        if (artErr) throw artErr;
        const { error: monErr } = await supabase
          .from(entityTable)
          .update({ image_url: url })
          .eq("id", entryId);
        if (monErr) throw monErr;
      }),
    );

    await supabase.from("library_art_staging").delete().eq("id", item.id);
    await supabase.storage.from(STAGING_BUCKET).remove([item.storage_path]);

    queryClient.invalidateQueries({ queryKey: [cfg.stagingQueryKey] });
    queryClient.invalidateQueries({ queryKey: [artQueryKey] });
    queryClient.invalidateQueries({ queryKey: [repairQueryKey] });
  } catch (err) {
    assignStatuses.value[item.id] = "error";
    stagingErrors.value[item.id] =
      err instanceof Error ? err.message : "Failed";
  }
}

async function discardStaged(item: StagingItem) {
  await supabase.from("library_art_staging").delete().eq("id", item.id);
  await supabase.storage.from(STAGING_BUCKET).remove([item.storage_path]);
  queryClient.invalidateQueries({ queryKey: [cfg.stagingQueryKey] });
}
</script>

<template>
  <div class="rounded-lg border border-border bg-card p-4 space-y-4">
    <!-- header (always visible, click to expand/collapse) -->
    <LibraryArtPanelHeader
      :title="cfg.title"
      :open="panelOpen"
      :with-art-count="withArtCount"
      :total="total"
      :staging-count="stagingItems?.length ?? 0"
      @toggle="panelOpen = !panelOpen"
    />

    <!-- body — v-if keeps FocalImage components unmounted when collapsed -->
    <template v-if="panelOpen">

    <!-- tab bar -->
    <LibraryArtTabBar
      :active-tab="activeTab"
      :staging-count="stagingItems?.length ?? 0"
      @update:active-tab="activeTab = $event"
    />

    <!-- ══ LIBRARY TAB ══ -->
    <template v-if="activeTab === 'library'">
      <!-- source tabs -->
      <div v-if="sources.length > 1" class="flex flex-wrap gap-1.5">
        <button
          v-for="src in sources"
          :key="src"
          class="px-2.5 py-1 rounded font-cinzel text-xs tracking-wide border transition-colors"
          :class="
            selectedSource === src
              ? 'bg-primary text-primary-foreground border-primary'
              : 'border-border text-muted-foreground hover:bg-muted'
          "
          @click="selectedSource = src"
        >
          {{ src }}
        </button>
      </div>

      <div
        v-if="libraryPending"
        class="text-caption text-muted-foreground italic"
      >
        Loading…
      </div>

      <div
        v-else-if="visibleMonsters.length > 0"
        class="divide-y divide-border rounded-md border border-border overflow-hidden max-h-[60vh] overflow-y-auto"
      >
        <LibraryArtListRow
          v-for="m in visibleMonsters"
          :key="m.entry_id"
          :entity="m"
          :status="rowStatuses[m.entry_id]"
          :error-msg="rowErrors[m.entry_id]"
          :dragging="rowDragging[m.entry_id]"
          :expanded="rowExpanded[m.entry_id]"
          :focal-point="rowFocalPoints[m.entry_id]"
          :uploaded-url="rowUploadedUrls[m.entry_id]"
          @upload="processFile(m.entry_id, $event)"
          @clear="clearArt(m.entry_id)"
          @toggle-focal="toggleFocal(m)"
          @set-focal="setFocalPoint(m, $event)"
          @preview="previewId = m.entry_id"
          @drag-enter="onRowDragEnter(m.entry_id, $event)"
          @drag-over="onRowDragOver"
          @drag-leave="onRowDragLeave(m.entry_id, $event)"
          @drop="onRowDrop(m.entry_id, $event)"
        />
      </div>

      <p
        v-else-if="!libraryPending"
        class="text-caption text-muted-foreground italic"
      >
        No SRD monsters found.
      </p>
    </template>

    <!-- ══ STAGING TAB ══ -->
    <template v-else>
      <!-- drop zone / dump area -->
      <LibraryArtUploadPanel
        :uploading="stagingUploading"
        :progress-done="stagingProgress.done"
        :progress-total="stagingProgress.total"
        :dragging="stagingDragging"
        @files="uploadStagingFiles"
        @update:dragging="stagingDragging = $event"
      />

      <!-- staged queue -->
      <div
        v-if="stagingPending"
        class="text-caption text-muted-foreground italic"
      >
        Loading…
      </div>

      <template v-else-if="stagingItems && stagingItems.length > 0">
        <p class="font-cinzel text-xs text-muted-foreground tracking-wide">
          {{ stagingItems.length }} image{{
            stagingItems.length === 1 ? "" : "s"
          }}
          waiting — pick a monster and assign
        </p>

        <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          <LibraryArtStagingCard
            v-for="item in stagingItems"
            :key="item.id"
            :item="item"
            :options="monsterOptions"
            :search="stagingSearches[item.id] ?? ''"
            :selected="stagingSelected[item.id] ?? []"
            :assign-status="assignStatuses[item.id] ?? 'idle'"
            :error="stagingErrors[item.id] ?? ''"
            @update:search="stagingSearches[item.id] = $event"
            @toggle-selection="toggleStagingSelection(item.id, $event)"
            @assign="assignStagedToSelected(item)"
            @discard="discardStaged(item)"
            @preview-entity="previewId = $event"
          />
        </div>
      </template>

      <p
        v-else-if="!stagingPending && !stagingUploading"
        class="text-caption text-muted-foreground italic"
      >
        No images in staging. Dump some from your phone to get started.
      </p>
    </template>

    </template> <!-- /panelOpen -->
  </div>

  <!-- Entity preview modal -->
  <LibraryArtPreviewModal
    v-if="previewId"
    :monster="previewMonster ?? null"
    :spell="previewSpell ?? null"
    @close="previewId = null"
  />
</template>
