/**
 * Why paint-brush-tips refuses a caller, as a pure decision so each refusal can be tested without Deno (#1181).
 * Order matters: a non-DM learns nothing about the campaign's AI setting.
 */
export interface RefusalInput {
  isDm: boolean;
  aiEnabled: boolean;
}

export function refusalFor(input: RefusalInput): { error: string; status: number } | null {
  if (!input.isDm) return { error: "forbidden", status: 403 };
  if (!input.aiEnabled) return { error: "ai_disabled", status: 403 };
  return null;
}
