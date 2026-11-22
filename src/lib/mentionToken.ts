/** The plain-text token shape inserted by MentionTextarea and resolved by its callers. */
export function mentionToken(label: string): string {
  return `@${label.trim().replace(/\s+/g, "_")}`;
}

/** Match one complete @ mention while allowing sentence punctuation after it. */
export function mentionTokenPattern(label: string): RegExp {
  const token = mentionToken(label).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^\\p{L}\\p{N}_])${token}(?=$|[^\\p{L}\\p{N}_])`, "gu");
}

export function includesMentionToken(text: string, label: string): boolean {
  return mentionTokenPattern(label).test(text);
}
