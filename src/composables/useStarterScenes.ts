import { ref, computed } from "vue";
import { useQueryClient } from "@tanstack/vue-query";
import { storeToRefs } from "pinia";
import { supabase } from "@/lib/supabase";
import { useCampaignStore } from "@/stores/campaign";
import { useAuthStore } from "@/stores/auth";
import { usePlaylists } from "@/composables/useSoundboardPlaylists";
import { STARTER_SCENES, starterSceneSlugs, type StarterScene } from "@/data/starterScenes";
import { planStarterScenes, type PlannedScene } from "@/lib/audio/starterScenePlan";
import { DEFAULT_LAYER } from "@/types/sound.types";
import type { Sound, SoundLibraryEntry, SoundboardPlaylist } from "@/types/sound.types";

/**
 * Stocking an empty board from the curated scenes (#572 phase 3).
 *
 * The point of this is that a DM should be able to run a session on day one
 * without sourcing a file. It creates the underlying sounds, the scene
 * playlists, and the layer settings that make a scene sound like a place
 * rather than a stack of loops.
 *
 * None of it counts against the free tier: catalogue sounds carry `library_id`
 * and scene playlists carry `library_scene_slug`, and the quota functions
 * exclude both. Handing someone a library and then charging them room to keep
 * it would be a strange gift.
 *
 * Adding twice is safe — the plan skips scenes already on the board and reuses
 * sounds already added rather than duplicating them.
 */

async function fetchCatalogueBySlug(slugs: string[]): Promise<Map<string, SoundLibraryEntry>> {
  const { data, error } = await supabase
    .from("sound_library")
    .select("*")
    .in("slug", slugs);
  if (error) throw error;
  if (data === null) throw new Error("sound_library returned no payload");
  return new Map((data as SoundLibraryEntry[]).map((row) => [row.slug, row]));
}

async function fetchBoardState(campaignId: string): Promise<{
  soundIdByLibraryId: Map<string, string>;
  sceneSlugs: Set<string>;
}> {
  const [{ data: sounds, error: soundsErr }, { data: playlists, error: plErr }] = await Promise.all([
    supabase
      .from("sounds")
      .select("id, library_id")
      .eq("campaign_id", campaignId)
      .not("library_id", "is", null),
    supabase
      .from("soundboard_playlists")
      .select("library_scene_slug")
      .eq("campaign_id", campaignId)
      .not("library_scene_slug", "is", null),
  ]);
  if (soundsErr) throw soundsErr;
  if (plErr) throw plErr;
  if (sounds === null || playlists === null) throw new Error("board state returned no payload");

  const soundIdByLibraryId = new Map<string, string>();
  for (const row of sounds as Pick<Sound, "id" | "library_id">[]) {
    if (row.library_id !== null) soundIdByLibraryId.set(row.library_id, row.id);
  }

  const sceneSlugs = new Set<string>();
  for (const row of playlists as { library_scene_slug: string | null }[]) {
    if (row.library_scene_slug !== null) sceneSlugs.add(row.library_scene_slug);
  }

  return { soundIdByLibraryId, sceneSlugs };
}

/** Creates the `sounds` rows a plan needs, returning libraryId → new sound id. */
async function createSoundsFor(
  entries: SoundLibraryEntry[],
  campaignId: string,
  userId: string,
): Promise<Map<string, string>> {
  if (entries.length === 0) return new Map();

  const inserts = entries.map((entry, index) => ({
    campaign_id: campaignId,
    user_id: userId,
    name: entry.title,
    category: entry.category,
    source_type: "library" as const,
    file_url: entry.file_url,
    // Never the catalogue's storage path: one object backs every campaign that
    // added it, so recording it here would let one DM's delete remove it for
    // everyone else. See `deleteSound`.
    storage_path: null,
    library_id: entry.id,
    page_id: null,
    // Theme labels ride along, which is what makes encounter and location
    // triggers work the moment a scene is added.
    tags: entry.tags,
    sort_order: index,
    attribution: entry.attribution,
    attribution_url: entry.attribution === null ? null : entry.source_page,
    artist: entry.author,
    thumbnail_url: null,
    gain_trim: entry.gain_trim,
  }));

  const { data, error } = await supabase.from("sounds").insert(inserts).select("id, library_id");
  if (error) throw error;
  if (data === null) throw new Error("sound insert returned no payload");

  const created = new Map<string, string>();
  for (const row of data as Pick<Sound, "id" | "library_id">[]) {
    if (row.library_id !== null) created.set(row.library_id, row.id);
  }
  return created;
}

async function createScene(
  planned: PlannedScene,
  soundIdByLibraryId: ReadonlyMap<string, string>,
  campaignId: string,
  userId: string,
  sortOrder: number,
): Promise<void> {
  const { data, error } = await supabase
    .from("soundboard_playlists")
    .insert({
      campaign_id: campaignId,
      user_id: userId,
      page_id: null,
      name: planned.scene.name,
      playlist_type: "ambient",
      shuffle: false,
      repeat: true,
      sort_order: sortOrder,
      tags: [planned.scene.theme],
      library_scene_slug: planned.scene.slug,
    })
    .select()
    .single();
  if (error) throw error;

  const playlist = data as SoundboardPlaylist;
  const tracks = planned.layers
    .map((layer, index) => {
      const soundId = soundIdByLibraryId.get(layer.libraryId);
      if (soundId === undefined) return null;
      return {
        playlist_id: playlist.id,
        sound_id: soundId,
        sort_order: index,
        ...DEFAULT_LAYER,
        ...layer.settings,
      };
    })
    .filter((track): track is NonNullable<typeof track> => track !== null);

  if (tracks.length === 0) return;
  const { error: trackErr } = await supabase.from("soundboard_playlist_tracks").insert(tracks);
  if (trackErr) throw trackErr;
}

export function useStarterScenes() {
  const qc = useQueryClient();
  const { activeCampaignId } = storeToRefs(useCampaignStore());
  const auth = useAuthStore();
  const { data: playlists } = usePlaylists();

  const isAdding = ref(false);
  const addedCount = ref(0);
  const errorMessage = ref<string | null>(null);

  /**
   * Scenes this campaign does not have yet.
   *
   * The offer has to be driven by this rather than by "is the board empty":
   * a campaign started before the library shipped has plenty of sounds on it
   * and none of these scenes, and would otherwise never be told they exist.
   * It also keeps the count honest after a partial add or a deletion.
   */
  const missingScenes = computed<StarterScene[]>(() => {
    const rows = playlists.value;
    if (rows === undefined) return [];
    const present = new Set(
      rows.map((pl) => pl.library_scene_slug).filter((slug): slug is string => slug !== null),
    );
    return STARTER_SCENES.filter((scene) => !present.has(scene.slug));
  });

  const hasMissingScenes = computed(() => missingScenes.value.length > 0);

  const canAdd = computed(
    () => activeCampaignId.value !== null && !isAdding.value && hasMissingScenes.value,
  );

  async function addScenes(scenes: readonly StarterScene[] = missingScenes.value): Promise<void> {
    const campaignId = activeCampaignId.value;
    const userId = auth.user?.id;
    if (campaignId === null || campaignId === undefined || userId === undefined) return;

    isAdding.value = true;
    errorMessage.value = null;
    addedCount.value = 0;

    try {
      const [catalogue, board] = await Promise.all([
        fetchCatalogueBySlug(starterSceneSlugs(scenes)),
        fetchBoardState(campaignId),
      ]);

      const plan = planStarterScenes({
        scenes,
        catalogueBySlug: new Map([...catalogue].map(([slug, row]) => [slug, row.id])),
        existingLibraryIds: new Set(board.soundIdByLibraryId.keys()),
        existingSceneSlugs: board.sceneSlugs,
      });

      if (plan.scenes.length === 0) return;

      const entriesById = new Map([...catalogue.values()].map((row) => [row.id, row]));
      const newEntries = plan.libraryIdsToCreate
        .map((id) => entriesById.get(id))
        .filter((entry): entry is SoundLibraryEntry => entry !== undefined);

      const created = await createSoundsFor(newEntries, campaignId, userId);
      const soundIdByLibraryId = new Map([...board.soundIdByLibraryId, ...created]);

      // Sequential rather than parallel: each scene is two dependent writes,
      // and a burst of them racing gives a worse failure than a slower loop.
      for (const [index, planned] of plan.scenes.entries()) {
        await createScene(planned, soundIdByLibraryId, campaignId, userId, index);
        addedCount.value++;
      }
    } catch (err) {
      errorMessage.value = err instanceof Error ? err.message : "Could not add the starter scenes.";
      throw err;
    } finally {
      isAdding.value = false;
      qc.invalidateQueries({ queryKey: ["sounds", campaignId] });
      qc.invalidateQueries({ queryKey: ["soundboard_playlists", campaignId] });
    }
  }

  return {
    addScenes,
    isAdding,
    addedCount,
    errorMessage,
    canAdd,
    missingScenes,
    hasMissingScenes,
    scenes: STARTER_SCENES,
  };
}
