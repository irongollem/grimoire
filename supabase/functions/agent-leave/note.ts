// The body of the note a sitting leaves behind: a TipTap document, as the editor stores it (a JSON string).
// One line saying what it is, then the facts the party knows as a bulleted list, in the order they were filed.

export function noteDocument(facts: string[]): string {
  const paragraph = (text: string) => ({ type: "paragraph", content: [{ type: "text", text }] });
  return JSON.stringify({
    type: "doc",
    content: [
      paragraph("What went on the record at the AI table."),
      { type: "bulletList", content: facts.map((fact) => ({ type: "listItem", content: [paragraph(fact)] })) },
    ],
  });
}
