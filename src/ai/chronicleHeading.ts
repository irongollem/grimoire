/**
 * Split a generated chronicle into its title line and its body.
 *
 * The Chronicler's system prompt asks for a markdown narrative and says nothing
 * about a title, so every model opens with one anyway — `# Session 4: The
 * Duke's Blood`, sometimes just `# The Duke's Blood`. That heading was landing
 * in the note body while the note's own Title and Session # fields stayed
 * empty, which is the one thing the DM then has to retype by hand out of text
 * they are looking straight at.
 *
 * So it is parsed out here and handed to the fields it was always describing.
 * Pure, and colocated with the other `resolveGenerated*` post-processors: what
 * a model puts at the top of its output is a guess, and a guess belongs
 * somewhere a test can pin it.
 */

export interface ChronicleHeading {
  /** Heading text with any `Session N` prefix removed, or null when the output opened with no title. */
  title: string | null;
  /** Session number read off the heading, or null when it carried none. */
  sessionNum: number | null;
  /** The markdown with the title heading removed. Unchanged when nothing was found. */
  body: string;
}

/** ATX heading: up to six #'s, the text, and optional closing #'s. */
const HEADING = /^(#{1,6})\s+(.+?)\s*#*$/;

/**
 * `Session 4: `, `Session 4 — `, `Session #4 - `, or a bare `Session 4`.
 * Deliberately anchored: "The Session of Blades" is a title, not a number.
 */
const SESSION_PREFIX = /^session\s*#?\s*(\d{1,4})\b\s*[:.–—-]*\s*/i;

/** Drop the emphasis markers models like to wrap a title in. */
function stripEmphasis(text: string): string {
  return text.replace(/\*\*|\*|__|_/g, "").trim();
}

export function parseChronicleHeading(markdown: string): ChronicleHeading {
  const lines = markdown.split("\n");

  // The heading has to be the first thing in the output. A `# ` further down is
  // the model dividing scenes, and eating that would silently delete a section.
  let i = 0;
  while (i < lines.length && lines[i].trim() === "") i++;
  if (i >= lines.length) return { title: null, sessionNum: null, body: markdown };

  const match = lines[i].match(HEADING);
  if (!match) return { title: null, sessionNum: null, body: markdown };

  const level = match[1].length;
  const text = stripEmphasis(match[2]);
  const session = text.match(SESSION_PREFIX);

  // An H1 is a title by convention. A lower heading only counts as one when it
  // names a session number — otherwise a run of `## ` scene dividers would lose
  // its first scene.
  if (level > 1 && !session) return { title: null, sessionNum: null, body: markdown };

  const remainder = session ? stripEmphasis(text.slice(session[0].length)) : text;

  const rest = lines.slice(i + 1);
  while (rest.length && rest[0].trim() === "") rest.shift();

  return {
    title: remainder || null,
    sessionNum: session ? Number(session[1]) : null,
    body: rest.join("\n"),
  };
}
