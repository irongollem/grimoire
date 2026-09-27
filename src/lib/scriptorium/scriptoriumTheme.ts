/*
 * Injection key carrying the ancestor document's `ScriptoriumTheme` down to
 * `entityEmbed` node views (#917 story 2).
 *
 * `EntityEmbedView.vue` used to always format its stat block as "onednd2024",
 * regardless of the document it was mounted in, and called that gap
 * "galley-only cosmetic" — but the same node view is what
 * `ScriptoriumDocumentView.vue` mounts read-only for the phone reader and
 * quest handouts, so a Classic (phb2014) document rendered the 2024
 * ability-score table everywhere it was actually READ, not just in the
 * editor. `ScriptoriumEditor.vue` provides its own `theme` ref;
 * `ScriptoriumDocumentView.vue` provides a computed derived from the
 * document's stored `theme` column. `EntityEmbedView.vue` injects whichever
 * is in scope and falls back to "onednd2024" only when neither ancestor
 * provided one (a bare/standalone mount).
 */
import type { InjectionKey, Ref } from "vue";
import type { ScriptoriumTheme } from "@/types/scriptorium.types";

export const SCRIPTORIUM_THEME_KEY: InjectionKey<Readonly<Ref<ScriptoriumTheme>>> =
  Symbol("scriptoriumTheme");
