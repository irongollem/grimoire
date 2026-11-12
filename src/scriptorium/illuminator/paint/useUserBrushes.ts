/*
 * The painter's own brushes, kept (#1181). One read (this painter's rows, filtered in the query, errors thrown),
 * and the writes: make one, import many, change one, rename, remove. The table is the painter's alone and is not
 * campaign data, so nothing rings; this composable keeps its own query in step after each write.
 *
 * A brush's tip and grain pictures are files. They are uploaded before the row exists and removed again if the
 * rest of the write fails, or when the brush is deleted, so no file is left without a row.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/vue-query";
import { computed } from "vue";
import { getCurrentUser, supabase } from "@/lib/supabase";
import type { PaintAssetStore } from "./assets/loadPaintAssets";
import { browserBrushFiles, type BrushFileDeps } from "./brushes/brushFiles";
import {
  presetFromRow,
  rowFromPreset,
  userBrushesFromRows,
  userGrainId,
  userTipId,
  type BrushSource,
  type PaintBrushRow,
  type UserBrush,
} from "./brushes/userBrushes";
import type { BrushPreset, GrainImage, TipImage } from "./engine/types";

export interface NewBrush {
  preset: BrushPreset;
  /** The tip picture when the preset's tip is a picture of its own. */
  tip: TipImage | null;
  grain: GrainImage | null;
  source: BrushSource;
  setName: string | null;
}

const UPLOADS_AT_ONCE = 4;
export const brushesKey = (userId: string | null) => ["paint-brushes", userId] as const;

/** Runs `work` over the items, at most `limit` at a time; rejects with the first failure after the running ones settle. */
async function mapLimit<T, R>(items: readonly T[], limit: number, work: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  let next = 0;
  let failure: unknown = null;
  let failed = false;
  async function lane(): Promise<void> {
    while (!failed) {
      const i = next++;
      if (i >= items.length) return;
      try {
        out[i] = await work(items[i]);
      } catch (e) {
        failed = true;
        failure = e;
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, lane));
  if (failed) throw failure;
  return out;
}

function requireUser(): string {
  const user = getCurrentUser();
  if (!user) throw new Error("Sign in to keep brushes.");
  return user.id;
}

export function useUserBrushes(assets: PaintAssetStore, files: BrushFileDeps = browserBrushFiles) {
  const qc = useQueryClient();
  const userId = computed(() => getCurrentUser()?.id ?? null);

  /** The painter's own files are fetched from their URLs, so the store has to be told where each lives. */
  function teach(row: PaintBrushRow): void {
    if (row.tip_url !== null) assets.addUserTipUrl(userTipId(row.id), row.tip_url);
    if (row.grain_url !== null) assets.addUserGrainUrl(userGrainId(row.id), row.grain_url);
  }

  const query = useQuery({
    queryKey: computed(() => brushesKey(userId.value)),
    enabled: computed(() => userId.value !== null),
    queryFn: async () => {
      const owner = requireUser();
      const { data, error } = await supabase
        .from("paint_brushes")
        .select("*")
        .eq("user_id", owner)
        .order("created_at", { ascending: true });
      if (error) throw error;
      const rows = data as PaintBrushRow[];
      for (const row of rows) teach(row);
      return rows;
    },
  });

  const rows = computed(() => query.data.value);
  const brushes = computed<UserBrush[]>(() => (rows.value ? userBrushesFromRows(rows.value) : []));

  function patchRows(update: (rows: PaintBrushRow[]) => PaintBrushRow[]): void {
    qc.setQueryData<PaintBrushRow[]>(brushesKey(userId.value), (old) => update(old ?? []));
  }

  /** Uploads every picture the brushes carry, then inserts all their rows at once. */
  async function addMany(items: readonly NewBrush[]): Promise<BrushPreset[]> {
    const owner = requireUser();
    const prepared = items.map((item) => {
      const stored = rowFromPreset(item.preset);
      if (stored.name === "") throw new Error("A brush needs a name.");
      if (stored.ownTip && item.tip === null) throw new Error(`"${stored.name}" has no tip picture.`);
      if (stored.ownGrain && item.grain === null) throw new Error(`"${stored.name}" has no grain picture.`);
      return { item, stored, id: crypto.randomUUID() };
    });
    const uploaded: string[] = [];
    const store = async (make: () => Promise<Blob>): Promise<string> => {
      const url = await files.upload(await make(), owner);
      uploaded.push(url);
      return url;
    };
    try {
      const made = await mapLimit(prepared, UPLOADS_AT_ONCE, async (p) => {
        const tip_url = p.stored.ownTip && p.item.tip ? await store(() => files.encodeTip(p.item.tip as TipImage)) : null;
        const grain_url = p.stored.ownGrain && p.item.grain ? await store(() => files.encodeGrain(p.item.grain as GrainImage)) : null;
        return { tip_url, grain_url };
      });
      const newRows = prepared.map((p, i) => ({
        id: p.id,
        user_id: owner,
        name: p.stored.name,
        preset: p.stored.preset,
        tip_url: made[i].tip_url,
        grain_url: made[i].grain_url,
        source: p.item.source,
        set_name: p.item.setName,
      }));
      const { data, error } = await supabase.from("paint_brushes").insert(newRows).select();
      if (error) throw error;
      const inserted = data as PaintBrushRow[];
      const out: BrushPreset[] = [];
      for (const row of inserted) {
        const preset = presetFromRow(row);
        if (!preset) throw new Error("The saved brush could not be read back.");
        teach(row);
        const source = prepared.find((p) => p.id === row.id)?.item;
        // The decoded pictures are at hand, so the brush paints before its files are fetched back.
        if (source?.tip) assets.putTip(userTipId(row.id), source.tip);
        if (source?.grain) assets.putGrain(userGrainId(row.id), source.grain);
        out.push(preset);
      }
      patchRows((old) => [...old, ...inserted]);
      return out;
    } catch (e) {
      // A row that was never written must not leave its pictures behind.
      if (uploaded.length > 0) await files.remove(uploaded).catch(() => undefined);
      throw e;
    }
  }

  const create = useMutation({ mutationFn: async (item: NewBrush) => (await addMany([item]))[0] });
  const importMany = useMutation({ mutationFn: (items: readonly NewBrush[]) => addMany(items) });

  /** Settings only: the pictures of a brush never change, and the name has its own call. */
  const update = useMutation({
    mutationFn: async ({ id, preset }: { id: string; preset: BrushPreset }) => {
      const owner = requireUser();
      const stored = rowFromPreset(preset);
      const { data, error } = await supabase
        .from("paint_brushes")
        .update({ preset: stored.preset })
        .eq("id", id)
        .eq("user_id", owner)
        .select();
      if (error) throw error;
      const [row] = data as PaintBrushRow[];
      if (row) patchRows((old) => old.map((r) => (r.id === id ? row : r)));
    },
  });

  const rename = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const owner = requireUser();
      const clean = name.trim().slice(0, 80);
      if (clean === "") throw new Error("A brush needs a name.");
      const { data, error } = await supabase.from("paint_brushes").update({ name: clean }).eq("id", id).eq("user_id", owner).select();
      if (error) throw error;
      const [row] = data as PaintBrushRow[];
      if (row) patchRows((old) => old.map((r) => (r.id === id ? row : r)));
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const owner = requireUser();
      const row = rows.value?.find((r) => r.id === id);
      const { error } = await supabase.from("paint_brushes").delete().eq("id", id).eq("user_id", owner);
      if (error) throw error;
      patchRows((old) => old.filter((r) => r.id !== id));
      const urls = [row?.tip_url, row?.grain_url].filter((u): u is string => typeof u === "string");
      if (urls.length > 0) await files.remove(urls);
    },
  });

  return {
    brushes,
    isLoading: query.isLoading,
    error: query.error,
    create: create.mutateAsync,
    importMany: importMany.mutateAsync,
    update: update.mutateAsync,
    rename: rename.mutateAsync,
    remove: remove.mutateAsync,
  };
}

export type UserBrushesHandle = ReturnType<typeof useUserBrushes>;
