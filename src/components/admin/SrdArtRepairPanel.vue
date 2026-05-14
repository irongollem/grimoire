<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { useQuery, useQueryClient } from "@tanstack/vue-query";
import {
  CheckIcon,
  ChevronDownIcon,
  UploadIcon,
  AlertCircleIcon,
  Loader2Icon,
  Trash2Icon,
  CrosshairIcon,
  ImagePlusIcon,
} from "lucide-vue-next";
import { supabase, getCurrentUser } from "@/lib/supabase";
import { uploadWithVariants } from "@/lib/storage";
import { toWebP } from "@/lib/mediaConvert";
import FocalImage from "@/components/common/FocalImage.vue";
import FocalPointPicker from "@/components/common/FocalPointPicker.vue";

// ── Props & config ────────────────────────────────────────────────────────────

const { mode = "monster" } = defineProps<{ mode?: "monster" | "spell" }>();

// mode never changes at runtime — plain object is sufficient, avoids computed/ref wrapping issues
const cfg = mode === "spell"
  ? {
      title: "SRD Spell Art",
      entityTable: "srd_spells" as const,
      artTable: "srd_spell_art" as const,
      bucket: "spellImages" as const,
      subtitleCol: "school" as const,
      stagingQueryKey: "srd-art-staging-spell",
      repairQueryKey: "srd-art-repair-list-spells",
      artQueryKey: "srd-spell-art",
    }
  : {
      title: "SRD Monster Art",
      entityTable: "srd_monsters" as const,
      artTable: "srd_monster_art" as const,
      bucket: "monsterImages" as const,
      subtitleCol: "monster_type" as const,
      stagingQueryKey: "srd-art-staging-monster",
      repairQueryKey: "srd-art-repair-list",
      artQueryKey: "srd-monster-art",
    };

// ── Types ─────────────────────────────────────────────────────────────────────

interface SrdEntityEntry {
  srd_id: string;
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

const STAGING_BUCKET = "monster-images"; // staging always lives here regardless of mode

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
const fileInputRefs = ref<Record<string, HTMLInputElement | null>>({});

// staging
const stagingFileInputRef = ref<HTMLInputElement | null>(null);
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
  queryFn: async (): Promise<SrdEntityEntry[]> => {
    // srd_* tables can exceed 1000 rows — paginate past PostgREST's cap
    const PAGE = 1000;
    const [artRes, allEntities] = await Promise.all([
      supabase
        .from(cfg.artTable)
        .select("srd_id, image_url, portrait_focal_point")
        .not("image_url", "is", null),
      (async () => {
        const rows: { id: string; name: string; subtitle: string; source: string; image_url: string | null }[] = [];
        let offset = 0;
        while (true) {
          // Explicit selects per table — template literals break Supabase's type parser
          const { data, error } = cfg.entityTable === "srd_spells"
            ? await supabase.from("srd_spells").select("id, name, school, source, image_url").order("name").range(offset, offset + PAGE - 1)
            : await supabase.from("srd_monsters").select("id, name, monster_type, source, image_url").order("name").range(offset, offset + PAGE - 1);
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

    const userArtMap = new Map(
      (artRes.data ?? []).map((r) => [
        r.srd_id,
        {
          image_url: r.image_url as string,
          portrait_focal_point: r.portrait_focal_point as { x: number; y: number } | null,
        },
      ]),
    );

    return allEntities
      .map((row) => {
        const userArt = userArtMap.get(row.id);
        return {
          srd_id: row.id,
          name: row.name,
          subtitle: row.subtitle,
          source: row.source,
          image_url: userArt?.image_url ?? row.image_url,
          portrait_focal_point: userArt?.portrait_focal_point ?? null,
          has_user_art: !!userArt,
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
      .from("srd_art_staging")
      .select("id, storage_path, created_at")
      .eq("entity_type", mode)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []).map((row) => ({
      id: row.id as string,
      storage_path: row.storage_path as string,
      created_at: row.created_at as string,
      image_url: supabase.storage
        .from(STAGING_BUCKET)
        .getPublicUrl(row.storage_path as string).data.publicUrl,
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
      (m) => m.has_user_art || rowStatuses.value[m.srd_id] === "done",
    ).length,
);

// ── Library: upload ───────────────────────────────────────────────────────────

function triggerUpload(srdId: string) {
  fileInputRefs.value[srdId]?.click();
}

async function processFile(srdId: string, file: File) {
  rowStatuses.value[srdId] = "uploading";
  rowErrors.value[srdId] = "";
  try {
    const userId = getCurrentUser()!.id;
    const blob = await toWebP(file);
    const { bucket, artTable, entityTable, artQueryKey, repairQueryKey } = cfg;
    const url = await uploadWithVariants({ bucket, blob, userId, folderPrefix: "srd" });
    if (!url) throw new Error("Upload returned null");

    const { error: artErr } = await supabase
      .from(artTable)
      .upsert(
        { srd_id: srdId, image_url: url, user_id: userId, is_canonical: true },
        { onConflict: "user_id,srd_id" },
      );
    if (artErr) throw artErr;

    const { error: monErr } = await supabase
      .from(entityTable)
      .update({ image_url: url })
      .eq("id", srdId);
    if (monErr) throw monErr;

    rowUploadedUrls.value[srdId] = url;
    rowStatuses.value[srdId] = "done";
    queryClient.invalidateQueries({ queryKey: [artQueryKey] });
    queryClient.invalidateQueries({ queryKey: [repairQueryKey] });
  } catch (err) {
    rowStatuses.value[srdId] = "error";
    rowErrors.value[srdId] =
      err instanceof Error ? err.message : "Upload failed";
  } finally {
    const el = fileInputRefs.value[srdId];
    if (el) el.value = "";
  }
}

function handleInputChange(srdId: string, event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (file) processFile(srdId, file);
}

async function clearArt(srdId: string) {
  const userId = getCurrentUser()!.id;
  const { artTable, entityTable, artQueryKey, repairQueryKey } = cfg;
  await supabase.from(artTable).delete().eq("srd_id", srdId).eq("user_id", userId);
  await supabase.from(entityTable).update({ image_url: null }).eq("id", srdId);
  delete rowStatuses.value[srdId];
  delete rowUploadedUrls.value[srdId];
  queryClient.invalidateQueries({ queryKey: [artQueryKey] });
  queryClient.invalidateQueries({ queryKey: [repairQueryKey] });
}

// ── Library: drag & drop ──────────────────────────────────────────────────────

function onRowDragEnter(srdId: string, event: DragEvent) {
  event.preventDefault();
  if (rowStatuses.value[srdId] === "uploading") return;
  rowDragging.value[srdId] = true;
}
function onRowDragOver(event: DragEvent) {
  event.preventDefault();
}
function onRowDragLeave(srdId: string, event: DragEvent) {
  const el = event.currentTarget as HTMLElement;
  if (!el.contains(event.relatedTarget as Node))
    rowDragging.value[srdId] = false;
}
function onRowDrop(srdId: string, event: DragEvent) {
  event.preventDefault();
  rowDragging.value[srdId] = false;
  if (rowStatuses.value[srdId] === "uploading") return;
  const file = event.dataTransfer?.files[0];
  if (file) processFile(srdId, file);
}

// ── Library: focal point ──────────────────────────────────────────────────────

function canExpandFocal(m: SrdEntityEntry) {
  return !!(
    rowUploadedUrls.value[m.srd_id] ?? (m.has_user_art ? m.image_url : null)
  );
}

function toggleFocal(m: SrdEntityEntry) {
  if (!canExpandFocal(m)) return;
  rowExpanded.value[m.srd_id] = !rowExpanded.value[m.srd_id];
}

function getLocalFocalPoint(m: SrdEntityEntry) {
  return m.srd_id in rowFocalPoints.value
    ? rowFocalPoints.value[m.srd_id]
    : m.portrait_focal_point;
}

async function setFocalPoint(
  m: SrdEntityEntry,
  fp: { x: number; y: number } | null,
) {
  rowFocalPoints.value[m.srd_id] = fp;
  const imageUrl = rowUploadedUrls.value[m.srd_id] ?? m.image_url!;
  const userId = getCurrentUser()!.id;
  const { artTable, artQueryKey } = cfg;
  const { error } = await supabase
    .from(artTable)
    .upsert(
      { srd_id: m.srd_id, image_url: imageUrl, portrait_focal_point: fp, user_id: userId, is_canonical: true },
      { onConflict: "user_id,srd_id" },
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
          .from("srd_art_staging")
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

function handleStagingInputChange(event: Event) {
  const files = (event.target as HTMLInputElement).files;
  if (files?.length) uploadStagingFiles(files);
  (event.target as HTMLInputElement).value = "";
}

function onStagingDragEnter(event: DragEvent) {
  event.preventDefault();
  stagingDragging.value = true;
}
function onStagingDragOver(event: DragEvent) {
  event.preventDefault();
}
function onStagingDragLeave(event: DragEvent) {
  const el = event.currentTarget as HTMLElement;
  if (!el.contains(event.relatedTarget as Node)) stagingDragging.value = false;
}
function onStagingDrop(event: DragEvent) {
  event.preventDefault();
  stagingDragging.value = false;
  const files = event.dataTransfer?.files;
  if (files?.length) uploadStagingFiles(files);
}

// ── Staging: assign ───────────────────────────────────────────────────────────

interface MonsterOption {
  id: string;
  name: string;
  source: string;
}

const monsterOptions = computed<MonsterOption[]>(() =>
  (monsters.value ?? []).map((m) => ({
    id: m.srd_id,
    name: m.name,
    source: m.source,
  })),
);

function filteredForItem(itemId: string): MonsterOption[] {
  const q = (stagingSearches.value[itemId] ?? "").toLowerCase().trim();
  if (q.length < 2) return [];
  return monsterOptions.value
    .filter((o) => o.name.toLowerCase().includes(q))
    .slice(0, 20);
}

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

    const { artTable, entityTable, artQueryKey, repairQueryKey } = cfg;
    await Promise.all(
      selected.map(async (srdId) => {
        const { error: artErr } = await supabase
          .from(artTable)
          .upsert(
            { srd_id: srdId, image_url: url, user_id: userId, is_canonical: true },
            { onConflict: "user_id,srd_id" },
          );
        if (artErr) throw artErr;
        const { error: monErr } = await supabase
          .from(entityTable)
          .update({ image_url: url })
          .eq("id", srdId);
        if (monErr) throw monErr;
      }),
    );

    await supabase.from("srd_art_staging").delete().eq("id", item.id);
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
  await supabase.from("srd_art_staging").delete().eq("id", item.id);
  await supabase.storage.from(STAGING_BUCKET).remove([item.storage_path]);
  queryClient.invalidateQueries({ queryKey: [cfg.stagingQueryKey] });
}
</script>

<template>
  <div class="rounded-lg border border-border bg-card p-4 space-y-4">
    <!-- header (always visible, click to expand/collapse) -->
    <button
      type="button"
      class="flex items-center justify-between gap-4 w-full text-left"
      @click="panelOpen = !panelOpen"
    >
      <div>
        <h2 class="font-cinzel text-sm font-semibold tracking-wide text-foreground">
          {{ cfg.title }}
        </h2>
        <p class="font-fell text-xs text-muted-foreground italic mt-0.5">
          Manage canonical SRD art. Dump images from your phone, assign on desktop.
        </p>
      </div>
      <div class="flex items-center gap-2 shrink-0">
        <div v-if="total > 0" class="font-cinzel text-xs text-muted-foreground tabular-nums">
          {{ withArtCount }}&thinsp;/&thinsp;{{ total }}
        </div>
        <div
          v-if="(stagingItems?.length ?? 0) > 0"
          class="font-cinzel text-[10px] text-primary tabular-nums"
        >
          {{ stagingItems!.length }} staged
        </div>
        <ChevronDownIcon
          class="h-4 w-4 text-muted-foreground transition-transform duration-200"
          :class="panelOpen ? 'rotate-180' : ''"
        />
      </div>
    </button>

    <!-- body — v-if keeps FocalImage components unmounted when collapsed -->
    <template v-if="panelOpen">

    <!-- tab bar -->
    <div class="flex gap-1 border-b border-border pb-0.5">
      <button
        class="px-3 py-1.5 font-cinzel text-[11px] tracking-wide rounded-t transition-colors"
        :class="
          activeTab === 'library'
            ? 'bg-muted text-foreground'
            : 'text-muted-foreground hover:text-foreground'
        "
        @click="activeTab = 'library'"
      >
        Library
      </button>
      <button
        class="relative px-3 py-1.5 font-cinzel text-[11px] tracking-wide rounded-t transition-colors"
        :class="
          activeTab === 'staging'
            ? 'bg-muted text-foreground'
            : 'text-muted-foreground hover:text-foreground'
        "
        @click="activeTab = 'staging'"
      >
        Staging
        <span
          v-if="(stagingItems?.length ?? 0) > 0"
          class="ml-1 inline-flex items-center justify-center w-4 h-4 rounded-full bg-primary text-primary-foreground text-[9px] font-bold"
        >
          {{ stagingItems!.length }}
        </span>
      </button>
    </div>

    <!-- ══ LIBRARY TAB ══ -->
    <template v-if="activeTab === 'library'">
      <!-- source tabs -->
      <div v-if="sources.length > 1" class="flex flex-wrap gap-1.5">
        <button
          v-for="src in sources"
          :key="src"
          class="px-2.5 py-1 rounded font-cinzel text-[11px] tracking-wide border transition-colors"
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
        class="font-fell text-xs text-muted-foreground italic"
      >
        Loading…
      </div>

      <div
        v-else-if="visibleMonsters.length > 0"
        class="divide-y divide-border rounded-md border border-border overflow-hidden max-h-[60vh] overflow-y-auto"
      >
        <div
          v-for="m in visibleMonsters"
          :key="m.srd_id"
          class="relative transition-colors"
          :class="rowDragging[m.srd_id] ? 'bg-primary/10' : 'bg-card'"
          @dragenter="onRowDragEnter(m.srd_id, $event)"
          @dragover="onRowDragOver"
          @dragleave="onRowDragLeave(m.srd_id, $event)"
          @drop="onRowDrop(m.srd_id, $event)"
        >
          <input
            type="file"
            accept="image/*"
            class="sr-only"
            :ref="
              (el) => {
                fileInputRefs[m.srd_id] = el as HTMLInputElement | null;
              }
            "
            @change="handleInputChange(m.srd_id, $event)"
          />

          <div
            v-if="rowDragging[m.srd_id]"
            class="absolute inset-0 flex items-center justify-center pointer-events-none z-10"
          >
            <span class="font-cinzel text-[10px] text-primary tracking-wide"
              >Drop to upload</span
            >
          </div>

          <!-- main row -->
          <div
            class="flex items-center gap-3 px-3 py-2"
            :class="rowStatuses[m.srd_id] !== 'uploading' ? 'cursor-copy' : ''"
          >
            <!-- thumbnail -->
            <button
              type="button"
              class="w-10 h-10 shrink-0 rounded overflow-hidden bg-muted relative group/thumb"
              :class="
                canExpandFocal(m)
                  ? 'cursor-pointer ring-1 ring-transparent hover:ring-primary/60 transition-all'
                  : 'cursor-copy'
              "
              @click.stop="canExpandFocal(m) ? toggleFocal(m) : undefined"
            >
              <FocalImage
                :src="m.image_url"
                :alt="m.name"
                format="portrait"
                placeholder="/assets/placeholders/monster.webp"
              />
              <div
                v-if="canExpandFocal(m)"
                class="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover/thumb:opacity-100 transition-opacity"
              >
                <CrosshairIcon class="h-4 w-4 text-white" />
              </div>
            </button>

            <div class="flex-1 min-w-0">
              <span
                class="font-cinzel text-xs font-semibold text-foreground truncate block"
                >{{ m.name }}</span
              >
              <span
                class="font-fell text-[10px] text-muted-foreground capitalize"
                >{{ m.subtitle }}</span
              >
            </div>

            <span
              v-if="rowErrors[m.srd_id]"
              class="font-fell text-[10px] text-destructive truncate max-w-30"
              :title="rowErrors[m.srd_id]"
            >
              {{ rowErrors[m.srd_id] }}
            </span>

            <div class="shrink-0 flex items-center gap-1">
              <Loader2Icon
                v-if="rowStatuses[m.srd_id] === 'uploading'"
                class="h-4 w-4 animate-spin text-muted-foreground"
              />
              <template v-else>
                <button
                  class="flex items-center gap-1 px-2 py-1 rounded text-[11px] font-cinzel tracking-wide border transition-colors"
                  :class="
                    rowStatuses[m.srd_id] === 'error'
                      ? 'border-destructive text-destructive hover:bg-destructive/10'
                      : rowDragging[m.srd_id]
                        ? 'border-primary text-primary'
                        : 'border-border text-foreground hover:bg-muted'
                  "
                  @click.stop="triggerUpload(m.srd_id)"
                >
                  <AlertCircleIcon
                    v-if="rowStatuses[m.srd_id] === 'error'"
                    class="h-3 w-3 shrink-0"
                  />
                  <CheckIcon
                    v-else-if="rowStatuses[m.srd_id] === 'done' || m.has_user_art"
                    class="h-3 w-3 shrink-0 text-green-500"
                  />
                  <UploadIcon v-else class="h-3 w-3 shrink-0" />
                  <span v-if="rowStatuses[m.srd_id] === 'error'">Retry</span>
                  <span v-else-if="rowStatuses[m.srd_id] === 'done' || m.has_user_art">Replace</span>
                  <span v-else>Upload</span>
                </button>

                <!-- Clear art — only when there is art to clear -->
                <button
                  v-if="m.has_user_art || rowStatuses[m.srd_id] === 'done'"
                  class="flex items-center justify-center w-7 h-7 rounded border border-border text-muted-foreground hover:text-destructive hover:border-destructive/50 transition-colors"
                  title="Clear art"
                  @click.stop="clearArt(m.srd_id)"
                >
                  <Trash2Icon class="h-3 w-3" />
                </button>
              </template>
            </div>
          </div>

          <!-- inline focal picker -->
          <div
            v-if="rowExpanded[m.srd_id] && canExpandFocal(m)"
            class="px-3 pb-3 ml-13"
          >
            <FocalPointPicker
              :src="rowUploadedUrls[m.srd_id] ?? m.image_url ?? ''"
              :model-value="getLocalFocalPoint(m)"
              class="max-w-36"
              @update:model-value="(fp) => setFocalPoint(m, fp)"
            />
          </div>
        </div>
      </div>

      <p
        v-else-if="!libraryPending"
        class="font-fell text-xs text-muted-foreground italic"
      >
        No SRD monsters found.
      </p>
    </template>

    <!-- ══ STAGING TAB ══ -->
    <template v-else>
      <!-- drop zone / dump area -->
      <div
        class="relative rounded-lg border-2 border-dashed transition-colors p-6 flex flex-col items-center justify-center gap-3 min-h-36 cursor-pointer"
        :class="
          stagingDragging
            ? 'border-primary bg-primary/5'
            : 'border-border hover:border-primary/50'
        "
        @dragenter="onStagingDragEnter"
        @dragover="onStagingDragOver"
        @dragleave="onStagingDragLeave"
        @drop="onStagingDrop"
        @click="stagingFileInputRef?.click()"
      >
        <input
          ref="stagingFileInputRef"
          type="file"
          accept="image/*"
          multiple
          class="sr-only"
          @change="handleStagingInputChange"
        />

        <template v-if="stagingUploading">
          <Loader2Icon class="h-8 w-8 text-primary animate-spin" />
          <p class="font-cinzel text-sm text-primary tracking-wide">
            Converting {{ stagingProgress.done }}&thinsp;/&thinsp;{{
              stagingProgress.total
            }}…
          </p>
          <p class="font-fell text-xs text-muted-foreground italic">
            Converting to WebP and uploading
          </p>
        </template>
        <template v-else>
          <ImagePlusIcon class="h-8 w-8 text-muted-foreground" />
          <p class="font-cinzel text-sm text-foreground tracking-wide">
            Drop images here or tap to pick
          </p>
          <p class="font-fell text-xs text-muted-foreground italic text-center">
            Select as many as you like. Each is converted to WebP and held in
            staging until you assign it on desktop.
          </p>
        </template>
      </div>

      <!-- staged queue -->
      <div
        v-if="stagingPending"
        class="font-fell text-xs text-muted-foreground italic"
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
          <div
            v-for="item in stagingItems"
            :key="item.id"
            class="rounded-lg border border-border bg-card overflow-hidden flex flex-col"
          >
            <!-- preview — plain img to avoid backfillVariants on staging files -->
            <div class="relative h-44 bg-muted overflow-hidden">
              <img
                :src="item.image_url"
                alt=""
                class="w-full h-full object-cover object-top"
              />
            </div>

            <!-- controls -->
            <div class="p-2 flex flex-col gap-2">
              <!-- search -->
              <input
                :value="stagingSearches[item.id] ?? ''"
                type="text"
                placeholder="Search monsters…"
                class="w-full rounded border border-border bg-background px-2 py-1 font-fell text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary"
                @input="
                  stagingSearches[item.id] = (
                    $event.target as HTMLInputElement
                  ).value
                "
              />

              <!-- checkbox results -->
              <div
                v-if="filteredForItem(item.id).length"
                class="max-h-32 overflow-y-auto flex flex-col gap-0.5 rounded border border-border bg-muted/30 p-1"
              >
                <label
                  v-for="opt in filteredForItem(item.id)"
                  :key="opt.id"
                  class="flex items-center gap-1.5 px-1.5 py-1 rounded cursor-pointer hover:bg-muted/60 font-fell text-xs"
                  :class="
                    (stagingSelected[item.id] ?? []).includes(opt.id)
                      ? 'bg-primary/10 text-primary'
                      : 'text-foreground'
                  "
                >
                  <input
                    type="checkbox"
                    class="h-3 w-3 accent-primary shrink-0"
                    :checked="(stagingSelected[item.id] ?? []).includes(opt.id)"
                    @change="toggleStagingSelection(item.id, opt.id)"
                  />
                  <span class="truncate">{{ opt.name }}</span>
                  <span
                    class="ml-auto shrink-0 font-cinzel text-[9px] text-muted-foreground tracking-wide"
                    >{{ opt.source }}</span
                  >
                </label>
              </div>
              <p
                v-else-if="(stagingSearches[item.id] ?? '').length >= 2"
                class="font-fell text-[10px] text-muted-foreground italic"
              >
                No matches
              </p>

              <div
                v-if="stagingErrors[item.id]"
                class="font-fell text-[10px] text-destructive"
              >
                {{ stagingErrors[item.id] }}
              </div>

              <div class="flex gap-1.5">
                <!-- Assign selected -->
                <button
                  class="flex-1 flex items-center justify-center gap-1 py-1 rounded font-cinzel text-[11px] tracking-wide border transition-colors"
                  :disabled="
                    !(stagingSelected[item.id] ?? []).length ||
                    assignStatuses[item.id] === 'assigning'
                  "
                  :class="
                    assignStatuses[item.id] === 'error'
                      ? 'border-destructive text-destructive hover:bg-destructive/10'
                      : !(stagingSelected[item.id] ?? []).length
                        ? 'border-border text-muted-foreground cursor-not-allowed'
                        : 'border-primary text-primary hover:bg-primary/10'
                  "
                  @click="assignStagedToSelected(item)"
                >
                  <Loader2Icon
                    v-if="assignStatuses[item.id] === 'assigning'"
                    class="h-3 w-3 animate-spin"
                  />
                  <AlertCircleIcon
                    v-else-if="assignStatuses[item.id] === 'error'"
                    class="h-3 w-3"
                  />
                  <UploadIcon v-else class="h-3 w-3" />
                  <template v-if="assignStatuses[item.id] === 'error'"
                    >Retry</template
                  >
                  <template v-else-if="(stagingSelected[item.id] ?? []).length">
                    Assign
                    {{ (stagingSelected[item.id] ?? []).length }} selected
                  </template>
                  <template v-else>Assign</template>
                </button>

                <!-- Discard without assigning -->
                <button
                  class="flex items-center gap-1 px-2 py-1 rounded border border-border font-cinzel text-[11px] tracking-wide text-muted-foreground hover:text-destructive hover:border-destructive/50 transition-colors"
                  title="Discard"
                  @click="discardStaged(item)"
                >
                  <Trash2Icon class="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </template>

      <p
        v-else-if="!stagingPending && !stagingUploading"
        class="font-fell text-xs text-muted-foreground italic"
      >
        No images in staging. Dump some from your phone to get started.
      </p>
    </template>

    </template> <!-- /panelOpen -->
  </div>
</template>
