/*
 * Who is reading a Scriptorium document (#970). The DM sees the live entity
 * behind an `entityEmbed`; a player sees only what the handout itself shows,
 * resolved through the player-gated projections (usePlayerEntityEmbed.ts).
 * `ScriptoriumDocumentView` provides this and `EntityEmbedView` injects it, the
 * same way the theme travels (scriptoriumTheme.ts).
 */
import type { InjectionKey, Ref } from "vue";

export type ScriptoriumAudience = { audience: "dm" } | { audience: "player"; campaignId: string };

export const SCRIPTORIUM_AUDIENCE_KEY: InjectionKey<Readonly<Ref<ScriptoriumAudience>>> =
  Symbol("scriptoriumAudience");
