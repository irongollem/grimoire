export interface StoryLocation {
  id: string;
  name: string;
}

/** Resolve a place explicitly named in the generator concept to a campaign location. */
export function locationNamedInStory(text: string, locations: readonly StoryLocation[]): StoryLocation | null {
  const matches = locations.filter((location) => {
    const name = location.name.trim();
    if (!name) return false;
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}($|[^\\p{L}\\p{N}])`, "iu").test(text);
  });
  if (!matches.length) return null;
  const longest = Math.max(...matches.map((location) => location.name.trim().length));
  const best = matches.filter((location) => location.name.trim().length === longest);
  return new Set(best.map((location) => location.id)).size === 1 ? best[0]! : null;
}
