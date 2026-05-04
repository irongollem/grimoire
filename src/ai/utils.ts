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
