// The cartographer's tool taxonomy.
//
// Lives here rather than in CartographerEditorView.vue because `renderMap`
// needs it and a logic module must not import from a view — that is the one
// direction this codebase does not allow (CLAUDE.md, "Module Placement":
// when ownership and dependency direction disagree, dependency direction
// wins). The view owns the TOOLS palette array — labels, icons, shortcuts,
// all presentation — and imports the union from here.
export type Tool =
  | "floor"
  | "eraser"
  | "pan"
  | "wall"
  | "door"
  | "solid"
  | "rect"
  | "line"
  | "fill"
  | "wrap"
  | "stamp"
  | "annotate"
  | "link"
  | "template"
  | "cave"
  // Structure group (#868) — doesn't paint pixels, it claims/annotates what
  // the drawing MEANS: "space" selects the derived room under the cursor.
  // Zoning was retired (#884 S11) — a zone is now a Plan region authored
  // once in the Plan palette, never derived from the Drawing.
  | "space";
