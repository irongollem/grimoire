# Scriptorium

The Scriptorium is Grimoire's book editor: a document is a book of chapters, a handout is a book of one chapter on a paper, and the Illuminator is the picture editor that places and treats the art inside them. This folder is meant to read as a small standalone app that references data kept elsewhere.

## Folders

- `components/` holds the editor, reader, document list, handout dialogs and the panel beside the page (`panel/`, `chapters/`, `inspect/` inside).
- `composables/` holds the data access and editor state: documents, chapters, PDF export, handout sharing, embeds.
- `lib/` holds the pure logic: book layout, page flow, furniture, chapters, import, looks and templates (`bookLayout/`, `chapters/`, `furniture/`, `inspect/`, `pageFlow/`).
- `tiptap/` holds the Tiptap extensions only the Scriptorium uses. Extensions shared with the rich text editor and the viewers stay in `src/lib/tiptap/`.
- `views/` holds the route views, including the Illuminator view.
- `illuminator/` holds the picture editor: `components/` for its panels and `lib/` for brush masks, grading, depth of field, edges, texture and vignette.
- `styles/` holds the page and paper themes and the editor CSS, imported by `src/assets/main.css` and inlined into PDF exports.
- `data/templates/` holds the starting templates, `types.ts` the document types and `stores/ui.ts` the list filter state.

## Rules

The Scriptorium reads other features' data (NPCs, monsters, items, spells, quests, the campaign) through their composables and owns nothing outside this folder except its routes (`src/router/routes.ts`) and its manual page (`src/manual/`).

Layering inside the module mirrors the app: `lib/`, `illuminator/lib/` and `tiptap/` must not import this module's composables, components, views or store, nor `src/composables/` or `src/stores/`. `npm run arch:graph` enforces it.
