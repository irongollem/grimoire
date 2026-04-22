/**
 * Class progression table templates for Scriptorium.
 *
 * Each factory returns Tiptap JSON (as a plain object) for a wide-block
 * wrapping a table with class `.sc-class-table`.
 *
 * The table node itself is a standard editable Tiptap table — no custom
 * node required. Authors can rename columns, fill features, and add rows
 * after insertion.
 *
 * Proficiency bonus follows the standard D&D 5e formula:
 *   2 for L1–4, 3 for L5–8, 4 for L9–12, 5 for L13–16, 6 for L17–20.
 */

/** Proficiency bonus lookup by level (index = level - 1). */
const PROF_BONUS = [
  "+2", "+2", "+2", "+2",
  "+3", "+3", "+3", "+3",
  "+4", "+4", "+4", "+4",
  "+5", "+5", "+5", "+5",
  "+6", "+6", "+6", "+6",
] as const;

/** Cantrips known per level for a full caster (typical Wizard / Sorcerer curve). */
const FULL_CASTER_CANTRIPS = [
  "3", "3", "3", "4",
  "4", "4", "4", "4",
  "4", "5", "5", "5",
  "5", "5", "5", "5",
  "5", "5", "5", "5",
] as const;

/** Spell slot counts per slot level for a full caster (rows = character level, cols = slot levels 1–9). */
const FULL_CASTER_SLOTS: readonly string[][] = [
  ["2", "—", "—", "—", "—", "—", "—", "—", "—"],
  ["3", "—", "—", "—", "—", "—", "—", "—", "—"],
  ["4", "2", "—", "—", "—", "—", "—", "—", "—"],
  ["4", "3", "—", "—", "—", "—", "—", "—", "—"],
  ["4", "3", "2", "—", "—", "—", "—", "—", "—"],
  ["4", "3", "3", "—", "—", "—", "—", "—", "—"],
  ["4", "3", "3", "1", "—", "—", "—", "—", "—"],
  ["4", "3", "3", "2", "—", "—", "—", "—", "—"],
  ["4", "3", "3", "3", "1", "—", "—", "—", "—"],
  ["4", "3", "3", "3", "2", "—", "—", "—", "—"],
  ["4", "3", "3", "3", "2", "1", "—", "—", "—"],
  ["4", "3", "3", "3", "2", "1", "—", "—", "—"],
  ["4", "3", "3", "3", "2", "1", "1", "—", "—"],
  ["4", "3", "3", "3", "2", "1", "1", "—", "—"],
  ["4", "3", "3", "3", "2", "1", "1", "1", "—"],
  ["4", "3", "3", "3", "2", "1", "1", "1", "—"],
  ["4", "3", "3", "3", "2", "1", "1", "1", "1"],
  ["4", "3", "3", "3", "3", "1", "1", "1", "1"],
  ["4", "3", "3", "3", "3", "2", "1", "1", "1"],
  ["4", "3", "3", "3", "3", "2", "2", "1", "1"],
];

/** Spell slot counts per slot level for a half caster (Paladin / Ranger, up to 5th-level slots). */
const HALF_CASTER_SLOTS: readonly string[][] = [
  ["—", "—", "—", "—", "—"],
  ["2", "—", "—", "—", "—"],
  ["3", "—", "—", "—", "—"],
  ["3", "—", "—", "—", "—"],
  ["4", "2", "—", "—", "—"],
  ["4", "2", "—", "—", "—"],
  ["4", "3", "—", "—", "—"],
  ["4", "3", "—", "—", "—"],
  ["4", "3", "2", "—", "—"],
  ["4", "3", "2", "—", "—"],
  ["4", "3", "3", "—", "—"],
  ["4", "3", "3", "—", "—"],
  ["4", "3", "3", "1", "—"],
  ["4", "3", "3", "1", "—"],
  ["4", "3", "3", "2", "—"],
  ["4", "3", "3", "2", "—"],
  ["4", "3", "3", "3", "1"],
  ["4", "3", "3", "3", "1"],
  ["4", "3", "3", "3", "2"],
  ["4", "3", "3", "3", "2"],
];

/**
 * Spell slot counts per slot level for a third caster (Arcane Trickster /
 * Eldritch Knight). Starts gaining slots at level 3 — rows 0–1 (L1–2) have
 * no slots. Up to 4th-level slots; total 20 rows.
 */
const THIRD_CASTER_SLOTS: readonly string[][] = [
  ["—", "—", "—", "—"],
  ["—", "—", "—", "—"],
  ["2", "—", "—", "—"],
  ["3", "—", "—", "—"],
  ["3", "—", "—", "—"],
  ["3", "—", "—", "—"],
  ["4", "2", "—", "—"],
  ["4", "2", "—", "—"],
  ["4", "2", "—", "—"],
  ["4", "3", "—", "—"],
  ["4", "3", "—", "—"],
  ["4", "3", "—", "—"],
  ["4", "3", "2", "—"],
  ["4", "3", "2", "—"],
  ["4", "3", "2", "—"],
  ["4", "3", "3", "—"],
  ["4", "3", "3", "—"],
  ["4", "3", "3", "—"],
  ["4", "3", "3", "1"],
  ["4", "3", "3", "1"],
];

// ── Tiptap node helpers ──────────────────────────────────────────────────────

function paragraph(text: string): object {
  return {
    type: "paragraph",
    content: text
      ? [{ type: "text", text }]
      : [],
  };
}

function tableCell(text: string): object {
  return {
    type: "tableCell",
    attrs: { colspan: 1, rowspan: 1 },
    content: [paragraph(text)],
  };
}

function tableHeader(text: string): object {
  return {
    type: "tableHeader",
    attrs: { colspan: 1, rowspan: 1 },
    content: [paragraph(text)],
  };
}

function headerRow(headers: string[]): object {
  return {
    type: "tableRow",
    content: headers.map(tableHeader),
  };
}

function dataRow(cells: string[]): object {
  return {
    type: "tableRow",
    content: cells.map(tableCell),
  };
}

/**
 * Wrap a table node in a wideBlock so it spans both columns in a
 * two-column Scriptorium document.
 */
function wideBlockTable(tableNode: object): object {
  return {
    type: "wideBlock",
    content: [tableNode],
  };
}

function table(rows: object[], cssClass: string): object {
  return {
    type: "table",
    attrs: { class: cssClass },
    content: rows,
  };
}

// ── Public factories ─────────────────────────────────────────────────────────

/**
 * Full caster progression (L1–20).
 * Columns: Level, Prof. Bonus, Class Features, Cantrips Known,
 *          1st – 9th spell slots.
 */
export function fullCasterTable(): object {
  const headers = [
    "Level", "Prof. Bonus", "Class Features", "Cantrips Known",
    "1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th", "9th",
  ];
  const rows: object[] = [headerRow(headers)];
  for (let lvl = 1; lvl <= 20; lvl++) {
    const i = lvl - 1;
    rows.push(
      dataRow([
        String(lvl),
        PROF_BONUS[i],
        "—",
        FULL_CASTER_CANTRIPS[i],
        ...FULL_CASTER_SLOTS[i],
      ]),
    );
  }
  return wideBlockTable(table(rows, "sc-class-table"));
}

/**
 * Half caster progression (L1–20).
 * Columns: Level, Prof. Bonus, Class Features, 1st – 5th spell slots.
 */
export function halfCasterTable(): object {
  const headers = [
    "Level", "Prof. Bonus", "Class Features",
    "1st", "2nd", "3rd", "4th", "5th",
  ];
  const rows: object[] = [headerRow(headers)];
  for (let lvl = 1; lvl <= 20; lvl++) {
    const i = lvl - 1;
    rows.push(
      dataRow([
        String(lvl),
        PROF_BONUS[i],
        "—",
        ...HALF_CASTER_SLOTS[i],
      ]),
    );
  }
  return wideBlockTable(table(rows, "sc-class-table"));
}

/**
 * Third caster progression (L1–20; spellcasting starts at L3).
 * Columns: Level, Prof. Bonus, Class Features, 1st – 4th spell slots.
 */
export function thirdCasterTable(): object {
  const headers = [
    "Level", "Prof. Bonus", "Class Features",
    "1st", "2nd", "3rd", "4th",
  ];
  const rows: object[] = [headerRow(headers)];
  for (let lvl = 1; lvl <= 20; lvl++) {
    const i = lvl - 1;
    rows.push(
      dataRow([
        String(lvl),
        PROF_BONUS[i],
        "—",
        ...THIRD_CASTER_SLOTS[i],
      ]),
    );
  }
  return wideBlockTable(table(rows, "sc-class-table"));
}

/**
 * Martial progression (L1–20).
 * Columns: Level, Prof. Bonus, Class Features, {customColumn}.
 *
 * @param customColumn - Name for the custom numeric column, e.g. "Ki Points".
 */
export function martialTable(customColumn: string): object {
  const headers = [
    "Level", "Prof. Bonus", "Class Features", customColumn,
  ];
  const rows: object[] = [headerRow(headers)];
  for (let lvl = 1; lvl <= 20; lvl++) {
    const i = lvl - 1;
    rows.push(
      dataRow([String(lvl), PROF_BONUS[i], "—", "—"]),
    );
  }
  return wideBlockTable(table(rows, "sc-class-table"));
}
