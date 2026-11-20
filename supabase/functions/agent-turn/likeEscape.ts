// Shared by every lookup that matches a name a model wrote: hazards, characters and belongings.
/** Text from a model's tool call, made to match as written inside an `ilike`: `%`, `_` and `\` lose their meaning. */
export function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (c) => `\\${c}`);
}
