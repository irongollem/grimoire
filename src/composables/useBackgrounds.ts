import { useQuery, useMutation, useQueryClient } from "@tanstack/vue-query";
import { computed, type Ref } from "vue";
import { supabase, getCurrentUser } from "@/lib/supabase";
import type { Background, BackgroundInsert, BackgroundUpdate } from "@/types/background.types";
import { removeStorageImages } from "@/composables/useImageUpload";

const QUERY_KEY = "backgrounds";
const OPEN5E_DOCS_KEY = "open5e-background-documents";

async function fetchBackgrounds(): Promise<Background[]> {
  const { data, error } = await supabase
    .from("backgrounds")
    .select("*")
    .order("name", { ascending: true });
  if (error) throw error;
  return (data ?? []) as Background[];
}

async function fetchBackground(id: string): Promise<Background> {
  const { data, error } = await supabase.from("backgrounds").select("*").eq("id", id).single();
  if (error) throw error;
  return data as Background;
}

async function createBackground(bg: BackgroundInsert): Promise<Background> {
  const user = getCurrentUser();
  if (!user) throw new Error("Not authenticated");
  const { data, error } = await supabase
    .from("backgrounds")
    .insert({ ...bg, user_id: user.id })
    .select()
    .single();
  if (error) throw error;
  return data as Background;
}

async function updateBackground(id: string, update: BackgroundUpdate): Promise<Background> {
  const { data, error } = await supabase
    .from("backgrounds")
    .update(update)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data as Background;
}

async function deleteBackground(bg: Background): Promise<void> {
  const { error } = await supabase.from("backgrounds").delete().eq("id", bg.id);
  if (error) throw error;
  await removeStorageImages("asset-images", bg.image_url);
}

export function useBackgrounds() {
  return useQuery({ queryKey: [QUERY_KEY], queryFn: fetchBackgrounds, staleTime: Infinity });
}

/** Returns a Map<background_id, background_name> for fast inline lookups. */
export function useBackgroundNameMap() {
  const { data } = useBackgrounds();
  return computed(() => {
    const m = new Map<string, string>();
    for (const bg of data.value ?? []) m.set(bg.id, bg.name);
    return m;
  });
}

export function useBackground(id: Ref<string>) {
  return useQuery({
    queryKey: [QUERY_KEY, id] as unknown as readonly unknown[],
    queryFn: () => fetchBackground(id.value),
    enabled: () => !!id.value,
  });
}

export function useCreateBackground() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createBackground,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [QUERY_KEY] }),
  });
}

export function useUpdateBackground() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, update }: { id: string; update: BackgroundUpdate }) =>
      updateBackground(id, update),
    onSuccess: (_d, { id }) => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY, id] });
    },
  });
}

export function useDeleteBackground() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteBackground,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [QUERY_KEY] }),
  });
}

// ── Open5e runtime import ─────────────────────────────────────────────────────

/** Open5e documents — lazy query, fires only when the source picker opens. */
export function useOpen5eBackgroundDocuments(enabled: Ref<boolean>) {
  return useQuery({
    queryKey: [OPEN5E_DOCS_KEY],
    queryFn: async () => {
      const { fetchOpen5eDocuments } = await import("@/lib/open5eBackgroundImport");
      return fetchOpen5eDocuments();
    },
    staleTime: Infinity,
    enabled,
  });
}

export type BackgroundImportResult = { inserted: number; updated: number };

/**
 * Pulls backgrounds from the selected Open5e documents and upserts them into
 * the `backgrounds` table as `open5e_import: true`. Mirrors the Spells /
 * Monsters sync shape: insert new-by-name, update existing open5e rows in
 * place when source / description / features change, never touch
 * user-uploaded art.
 */
export function useImportBackgrounds() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (sourceSlugs: string[]): Promise<BackgroundImportResult> => {
      const { fetchBackgrounds: fetchFromOpen5e } = await import("@/lib/open5eBackgroundImport");
      const backgrounds = await fetchFromOpen5e(sourceSlugs.length > 0 ? sourceSlugs : undefined);
      const user = getCurrentUser();
      if (!user) throw new Error("Not authenticated");

      const allNames = backgrounds.map((b) => b.name);
      type ExistingRow = {
        name: string;
        source: string | null;
        source_title: string | null;
        source_url: string | null;
        description: string | null;
        feature_name: string | null;
        feature_description: string | null;
      };
      const existing: ExistingRow[] = [];
      const CHUNK = 200;
      for (let i = 0; i < allNames.length; i += CHUNK) {
        const { data } = await supabase
          .from("backgrounds")
          .select("name, source, source_title, source_url, description, feature_name, feature_description")
          .eq("open5e_import", true)
          .in("name", allNames.slice(i, i + CHUNK));
        existing.push(...((data ?? []) as ExistingRow[]));
      }
      const existingMap = new Map(existing.map((e) => [e.name, e]));

      const toInsert = backgrounds.filter((b) => !existingMap.has(b.name));
      const INSERT_BATCH = 100;
      for (let i = 0; i < toInsert.length; i += INSERT_BATCH) {
        const batch = toInsert
          .slice(i, i + INSERT_BATCH)
          .map((b) => ({ ...b, user_id: user.id }));
        const { error } = await supabase.from("backgrounds").insert(batch);
        if (error) throw error;
      }

      const toUpdate = backgrounds.filter((b) => {
        const cur = existingMap.get(b.name);
        if (!cur) return false;
        return (
          cur.source !== b.source ||
          cur.source_title !== b.source_title ||
          cur.source_url !== b.source_url ||
          cur.description !== b.description ||
          cur.feature_name !== b.feature_name ||
          cur.feature_description !== b.feature_description
        );
      });

      const UPDATE_CONCURRENCY = 25;
      for (let i = 0; i < toUpdate.length; i += UPDATE_CONCURRENCY) {
        await Promise.all(
          toUpdate.slice(i, i + UPDATE_CONCURRENCY).map((b) =>
            supabase
              .from("backgrounds")
              .update({
                source: b.source,
                source_title: b.source_title,
                source_url: b.source_url,
                description: b.description,
                skill_proficiencies: b.skill_proficiencies,
                tool_proficiencies: b.tool_proficiencies,
                languages: b.languages,
                equipment: b.equipment,
                feature_name: b.feature_name,
                feature_description: b.feature_description,
                suggested_characteristics: b.suggested_characteristics,
              })
              .eq("open5e_import", true)
              .eq("name", b.name),
          ),
        );
      }

      return { inserted: toInsert.length, updated: toUpdate.length };
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [QUERY_KEY] }),
  });
}
