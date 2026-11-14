// The user-turn instruction of an import extraction, kept pure so a test can
// hold it. The system prompt (ai_system_prompts) tells the model to put scene
// prose in other words; a DM's own writing is the exception (#1194).

export const OWN_WRITING_GUIDANCE =
  "The DM wrote this source themselves, so the rule about putting scenes in other words does not apply. " +
  "Copy their descriptive and narrative text into the fields word for word (a beat's and the quest's dm_content, " +
  "NPC notes, descriptions), still splitting it into the right fields and still putting read-aloud text only in read_aloud.";

export interface InstructionInput {
  sourceKind: string;
  sourceText: string | null;
  pageCount: number;
  ownWriting: boolean;
  textGuidance: string;
}

export function buildInstruction(input: InstructionInput): string {
  const base = input.sourceKind === "text"
    ? `Extract every entity you can find from the following source text and return them as JSON matching the provided schema. ${input.textGuidance}`
    : `Extract every entity you can find from the attached ${input.sourceKind === "pdf" ? "PDF document" : "page photographs"} ` +
      `and return them as JSON matching the provided schema. There ${input.pageCount === 1 ? "is 1 page" : `are ${input.pageCount} pages`}.`;
  const own = input.ownWriting ? `\n\n${OWN_WRITING_GUIDANCE}` : "";
  return input.sourceKind === "text" ? `${base}${own}\n\n---\n${input.sourceText}` : `${base}${own}`;
}
