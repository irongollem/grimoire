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
  | "cave";
