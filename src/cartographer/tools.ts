// The cartographer's tool taxonomy.
//
// Lives here rather than in CartographerEditorView.vue because `renderMap`
// needs it and a logic module must not import from a view — that is the one
// direction this codebase does not allow (CLAUDE.md, "Module Placement":
// when ownership and dependency direction disagree, dependency direction
// wins). The view owns the TOOLS palette array — labels, icons, shortcuts,
// all presentation — and imports the union from here.
export type Tool =
  // The default tool on open — a click selects a cell for inspection,
  // a drag pans, exactly like Pan. Grouped with Pan in the palette (both are
  // "look, don't paint" tools) rather than with Draw.
  | "select"
  | "floor"
  // Water (tile packs v4): paints a cell's terrain, drawn in place of its floor.
  | "terrain"
  | "eraser"
  | "pan"
  | "wall"
  | "door"
  | "solid"
  | "rect"
  | "line"
  | "fill"
  | "wrap"
  // Place (#1073 story 11): the set's objects (chest, barrel, stairs, rubble) and the
  // Dressing books' props (tables, beds, coffins at any angle) from one picture catalogue.
  | "place"
  | "annotate"
  | "link"
  | "template"
  | "brush"
  // Structure group (#868) — doesn't paint pixels, it claims/annotates what
  // the drawing MEANS: "space" selects the derived room under the cursor.
  // Zoning was retired (#884 S11) — a zone is now a Plan region authored
  // once in the Plan palette, never derived from the Drawing.
  | "space";

/**
 * What the Place tool puts down. An object is a set's own stamp (a chest, a barrel), either
 * one chosen variant or "any", which mixes the variants by position the way the stamp always
 * did; a prop is a Dressing book's, placed at any angle above the objects. The tool holds
 * `null` when nothing is armed, which is when a click on a placed prop picks it up.
 */
export type PlaceItem =
  | { kind: "object"; category: import("@/cartographer/stampCategories").StampCategory; variant: number | "any" }
  | { kind: "prop"; propId: string };
