import { computed, toValue, type MaybeRefOrGetter } from "vue";
import { useQuery, useMutation, useQueryClient } from "@tanstack/vue-query";
import { storeToRefs } from "pinia";
import { supabase } from "@/lib/supabase";
import { DEFAULT_LAYER, type PlaylistTrackLayer } from "@/types/sound.types";
import { useCampaignStore } from "@/stores/campaign";
import { useAuthStore } from "@/stores/auth";
import type {
  SoundboardPlaylist,
  SoundboardPlaylistInsert,
  SoundboardPlaylistUpdate,
  PlaylistTrack,
  PlaylistTrackWithSound,
} from "@/types/sound.types";

const PLAYLISTS_KEY = "soundboard_playlists";
const TRACKS_KEY = "soundboard_playlist_tracks";

// ── Fetch helpers ─────────────────────────────────────────────────────────

async function fetchPlaylists(campaignId: string): Promise<SoundboardPlaylist[]> {
  const { data, error } = await supabase
    .from("soundboard_playlists")
    .select("*")
    .eq("campaign_id", campaignId)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  if (error) throw error;
  return data as SoundboardPlaylist[];
}

async function fetchPlaylistTracks(playlistId: string): Promise<PlaylistTrackWithSound[]> {
  const { data, error } = await supabase
    .from("soundboard_playlist_tracks")
    .select("*, sound:sounds(*)")
    .eq("playlist_id", playlistId)
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return data as PlaylistTrackWithSound[];
}

// ── Mutation helpers ──────────────────────────────────────────────────────

async function createPlaylist(pl: SoundboardPlaylistInsert & { user_id: string }): Promise<SoundboardPlaylist> {
  const { data, error } = await supabase
    .from("soundboard_playlists")
    .insert(pl)
    .select()
    .single();
  if (error) throw error;
  return data as SoundboardPlaylist;
}

async function updatePlaylist(id: string, update: SoundboardPlaylistUpdate): Promise<SoundboardPlaylist> {
  const { data, error } = await supabase
    .from("soundboard_playlists")
    .update(update)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data as SoundboardPlaylist;
}

async function deletePlaylist(id: string): Promise<void> {
  const { error } = await supabase.from("soundboard_playlists").delete().eq("id", id);
  if (error) throw error;
}

async function addTrack(playlistId: string, soundId: string, sortOrder: number): Promise<PlaylistTrack> {
  const { data, error } = await supabase
    .from("soundboard_playlist_tracks")
    .insert({ playlist_id: playlistId, sound_id: soundId, sort_order: sortOrder })
    .select()
    .single();
  if (error) throw error;
  return data as PlaylistTrack;
}

async function removeTrack(trackId: string): Promise<void> {
  const { error } = await supabase
    .from("soundboard_playlist_tracks")
    .delete()
    .eq("id", trackId);
  if (error) throw error;
}

/**
 * One ordered entry in a playlist: which sound, plus the layer settings a scene
 * remembers about it. Layer fields are optional — a music playlist has no use
 * for them and takes the column defaults.
 */
export interface PlaylistTrackInput {
  soundId: string;
  layer?: Partial<PlaylistTrackLayer>;
}

/** Replaces all tracks for a playlist with the given ordered entries. */
async function replaceTracksForPlaylist(playlistId: string, tracks: PlaylistTrackInput[]): Promise<void> {
  const { error: delErr } = await supabase
    .from("soundboard_playlist_tracks")
    .delete()
    .eq("playlist_id", playlistId);
  if (delErr) throw delErr;

  if (tracks.length === 0) return;

  const inserts = tracks.map((t, i) => ({
    playlist_id: playlistId,
    sound_id: t.soundId,
    sort_order: i,
    // Spread the caller's layer settings over the defaults rather than writing
    // undefined, so a music playlist simply takes the column defaults.
    ...DEFAULT_LAYER,
    ...t.layer,
  }));
  const { error: insErr } = await supabase
    .from("soundboard_playlist_tracks")
    .insert(inserts);
  if (insErr) throw insErr;
}

// ── Exported composables ──────────────────────────────────────────────────

export function usePlaylists() {
  const { activeCampaignId } = storeToRefs(useCampaignStore());
  return useQuery({
    queryKey: computed(() => [PLAYLISTS_KEY, activeCampaignId.value]),
    queryFn: () => fetchPlaylists(activeCampaignId.value!),
    enabled: () => !!activeCampaignId.value,
  });
}

export function usePlaylistTracks(playlistId: MaybeRefOrGetter<string | null>) {
  return useQuery({
    queryKey: computed(() => [TRACKS_KEY, toValue(playlistId)]),
    queryFn: () => fetchPlaylistTracks(toValue(playlistId)!),
    enabled: () => !!toValue(playlistId),
  });
}

export function useCreatePlaylist() {
  const qc = useQueryClient();
  const { activeCampaignId } = storeToRefs(useCampaignStore());
  const auth = useAuthStore();

  return useMutation({
    mutationFn: (pl: SoundboardPlaylistInsert) =>
      createPlaylist({ ...pl, user_id: auth.user!.id }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [PLAYLISTS_KEY, activeCampaignId.value] });
    },
  });
}

export function useUpdatePlaylist() {
  const qc = useQueryClient();
  const { activeCampaignId } = storeToRefs(useCampaignStore());

  return useMutation({
    mutationFn: ({ id, update }: { id: string; update: SoundboardPlaylistUpdate }) =>
      updatePlaylist(id, update),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [PLAYLISTS_KEY, activeCampaignId.value] });
    },
  });
}

export function useDeletePlaylist() {
  const qc = useQueryClient();
  const { activeCampaignId } = storeToRefs(useCampaignStore());

  return useMutation({
    mutationFn: (id: string) => deletePlaylist(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [PLAYLISTS_KEY, activeCampaignId.value] });
    },
  });
}

export function useAddTrackToPlaylist() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: ({ playlistId, soundId, sortOrder }: { playlistId: string; soundId: string; sortOrder: number }) =>
      addTrack(playlistId, soundId, sortOrder),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: [TRACKS_KEY, vars.playlistId] });
    },
  });
}

export function useRemoveTrackFromPlaylist() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: ({ trackId, playlistId: _pid }: { trackId: string; playlistId: string }) =>
      removeTrack(trackId),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: [TRACKS_KEY, vars.playlistId] });
    },
  });
}

export function useReplacePlaylistTracks() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: ({ playlistId, tracks }: { playlistId: string; tracks: PlaylistTrackInput[] }) =>
      replaceTracksForPlaylist(playlistId, tracks),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: [TRACKS_KEY, vars.playlistId] });
    },
  });
}
