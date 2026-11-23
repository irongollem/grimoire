import { wrapUserInput } from "./ai-prompt.ts";

/** Campaign details supplied by the tracker have their own budget. */
export const NPC_CONTEXT_LIMIT = 2000;

export function formatNpcUserInput(prompt: string, context: string, alterEgo: boolean): string {
  const input = context
    ? `${prompt}\n\nUse these constraints (override only if the concept explicitly conflicts):\n${context}`
    : prompt;
  const wrapped = wrapUserInput(input);
  return alterEgo
    ? `${wrapped}\n\nThis NPC has a disguise identity — populate disguise_name and disguise_image_prompt.`
    : wrapped;
}
