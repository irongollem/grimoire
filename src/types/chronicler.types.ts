import type { AiProvenance } from "@/ai/provenance";

export interface ChroniclerImage {
  id: string;
  campaign_id: string;
  user_id: string;
  image_url: string | null;
  prompt: string;
  size: string;
  created_at: string;
  status: "pending" | "ready" | "failed";
  error: string | null;
}

export type ChroniclerSize = "1024x1024" | "1536x1024" | "1024x1536";

/** A shape the scene dialog offers: what it is called, and the oblong the model paints for it (what it costs). */
export interface SceneShape { id: string; label: string; size: ChroniclerSize }

export type ImageJobKind =
  | "chronicler"
  | "group_portrait"
  | "npc_portrait"
  | "monster"
  | "item"
  | "spell"
  | "faction"
  | "location";

/**
 * What the "Write Chronicle" dialog hands back on Insert: the narrative body,
 * plus the two fields its title line was parsed into.
 *
 * Lives here rather than in the dialog because `<script setup>` cannot export,
 * and the note editor has to name the shape it receives.
 */
export interface ChronicleInsert {
  /** Markdown with the parsed title heading removed. */
  markdown: string;
  /** Note title to apply, or null to leave the note's own title alone. */
  title: string | null;
  /** Session number to apply, or null to leave the note's own alone. */
  sessionNum: number | null;
  /** Tags the model proposed (reconciled against the campaign's existing tag
   *  vocabulary), for the note editor to merge into its tag bar. */
  tags: string[];
  aiProvenance: AiProvenance | null;
}
