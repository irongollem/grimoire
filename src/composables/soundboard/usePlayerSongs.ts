import { computed } from "vue";
import { useQuery } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/stores/auth";
import { SONG_PICTURES } from "@/lib/icons";
import { type PlayerSongRow, toShelves } from "@/lib/songs/songShelf";
import { PLAYER_SONGS_KEY } from "@/lib/campaignLiveSync/registry";

/**
 * The songs the caller may play on /songs: every track of a music playlist a
 * DM marked "Players can listen", in every campaign the caller belongs to.
 * Keyed on the user so a phone handed to another account never shows the last
 * one's songs.
 */
export function usePlayerSongs() {
  const auth = useAuthStore();
  return useQuery({
    queryKey: computed(() => [PLAYER_SONGS_KEY, auth.user?.id ?? null] as const),
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_player_songs");
      if (error) throw error;
      return toShelves((data ?? []) as PlayerSongRow[], SONG_PICTURES.length);
    },
    enabled: () => !!auth.user,
  });
}
