import { useQuery } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";
import type { AudioLicenseGroup, ContentLicenseSource } from "@/types/license.types";

const CONTENT_LICENSES_KEY = "content-licenses";
const AUDIO_LICENSES_KEY = "audio-licenses";

async function fetchContentLicenses(): Promise<ContentLicenseSource[]> {
  const { data, error } = await supabase.rpc("get_content_licenses");
  if (error) throw error;
  return (data ?? []) as ContentLicenseSource[];
}

/**
 * One row per content source document actually present in the shared tables
 * (monsters, spells, items, species, rules, classes), with its license(s) and
 * copyright notice. This data only changes when the DB is re-seeded, hence
 * staleTime: Infinity.
 */
export function useContentLicenses() {
  return useQuery({
    queryKey: [CONTENT_LICENSES_KEY],
    queryFn: fetchContentLicenses,
    staleTime: Infinity,
  });
}

async function fetchAudioLicenses(): Promise<AudioLicenseGroup[]> {
  const { data, error } = await supabase.rpc("get_audio_licenses");
  if (error) throw error;
  return (data ?? []) as AudioLicenseGroup[];
}

/**
 * The soundboard's shipped audio catalogue, grouped by (license, source), with
 * the per-sound credit lines for the CC-BY groups. Separate from the compendium
 * licences: same page, different content, different attribution shape.
 */
export function useAudioLicenses() {
  return useQuery({
    queryKey: [AUDIO_LICENSES_KEY],
    queryFn: fetchAudioLicenses,
    staleTime: Infinity,
  });
}
