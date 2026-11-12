# Scriptorium

The Scriptorium is Grimoire's book editor: a document is a book of chapters, a handout is a book of one chapter on a paper, and you write on the page that prints, with a panel beside it describing what is selected. The Illuminator is the picture editor that treats the art inside them, and it opens over the book. This folder is meant to read as a small standalone app that references data kept elsewhere.

## Folders

- `components/` holds the editor, reader, document list, handout dialogs and header, with the panel beside the page (`panel/`), the chapter list (`chapters/`), the book kit and the "/" menu list (`kit/`) and the Read as spreads notes (`inspect/`) inside.
- `composables/` holds the data access and editor state: documents, chapters, what is selected, pictures and their bakes, the printed book the layout reports, PDF export, handout sharing, embeds.
- `lib/` holds the pure logic: book layout, page flow, furniture, chapters, the book kit, the panel's rules, zoom, print checking, import, looks and templates (`bookLayout/`, `chapters/`, `furniture/`, `inspect/`, `kit/`, `pageFlow/`, `panel/`).
- `tiptap/` holds the Tiptap extensions only the Scriptorium uses. Extensions shared with the rich text editor and the viewers stay in `src/lib/tiptap/`.
- `views/` holds the route views.
- `illuminator/` holds the picture editor, which opens over the book as a workbench (no route of its own): `components/` for its tools, stage and the AI actions, `lib/` for the recipe (`treatment.ts`, `applySteps.ts`), bakes, painted masks, grading, depth of field, edges, texture and vignette. Its workbench state, `useIlluminateWorkbench.ts`, sits beside `components/`.
- `styles/` holds the page and paper themes and the editor CSS, imported by `src/assets/main.css` and inlined into PDF exports.
- `data/templates/` holds the starting templates, `types.ts` the document types and `stores/ui.ts` the list filter state, plus the editor's Focus and zoom.

## Rules

The Scriptorium reads other features' data (NPCs, monsters, items, spells, quests, the campaign) through their composables and owns nothing outside this folder except its routes (`src/router/routes.ts`) and its manual page (`src/manual/`).

Layering inside the module mirrors the app: `lib/`, `illuminator/lib/` and `tiptap/` must not import this module's composables, components, views or store, nor `src/composables/` or `src/stores/`. `npm run arch:graph` enforces it.
