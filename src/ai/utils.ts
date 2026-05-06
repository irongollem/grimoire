export function buildCampaignContext(opts: {
  setting?: string | null;
  tone?: string | null;
  threads?: string | null;
}): string {
  const sections: string[] = [];
  const s = opts.setting?.trim();
  const t = opts.tone?.trim();
  const th = opts.threads?.trim();
  if (s) sections.push(`## Setting\n${s}`);
  if (t) sections.push(`## Campaign Tone\n${t}`);
  if (th) sections.push(`## Active Threads\n${th}`);
  if (!sections.length) return "";
  return `\n\nCampaign context provided by the DM (use it to ground tone, names, factions, and themes — but do not invent new facts that contradict it):\n\n${sections.join("\n\n")}`;
}

export function b64ToBlob(b64: string, mimeType = "image/webp"): Blob {
  const chars = atob(b64);
  const bytes = new Uint8Array(chars.length);
  for (let i = 0; i < chars.length; i++) bytes[i] = chars.charCodeAt(i);
  return new Blob([bytes], { type: mimeType });
}

export const AI_PROMPT_LIMIT = 1000;
export const AI_PROMPT_LIMIT_SHORT = 500;
export const AI_PROMPT_LIMIT_LONG = 2000;

export function wrapUserInput(input: string): string {
  return `<user_input>\n${input}\n</user_input>`;
}
