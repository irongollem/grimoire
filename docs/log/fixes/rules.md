# Fixes — Rules Reliquary

Resolved bugs in the **Rules Reliquary** area, newest first. Part of the Grimoire fix log — see the [log index](../index.md).

- [x] Custom subclass (archetype) descriptions rendered as raw Tiptap JSON — the codex archetype list (`ArchetypeList.vue`), the detail sheet (`CustomSubclassSheet.vue`), and the editor (`CustomSubclassEditorView.vue`) all treated `custom_subclasses.description` as a plain string, but the Open5e/PHB import stores a Tiptap doc there (and the editor was the one rich-text field still using a plain `<textarea>`, against the "Tiptap everywhere" convention). So PHB-imported subclasses like Oath of the Ancients printed `{"type":"doc",...}` on screen. Fixed by bringing the field in line: the list shows a flattened `toPlainText()` preview, the sheet renders via `RichTextViewer`, and the editor uses `RichTextEditor` (empty → saves `null`). Both the viewer and `toPlainText` tolerate the existing plain-text rows, so no data migration was needed.
