import type { OpenBookLeather } from "@/types/openBook.types";

/**
 * Colour and name of each leather. Solid colours for now: the design's swatches are textured hides, and the
 * textures are not in the app yet. The reader's cover will want the same table, so it lives here by the picker.
 */
export const LEATHERS: Record<OpenBookLeather, { label: string; color: string }> = {
  oxblood: { label: "Oxblood", color: "#7a1f1a" },
  sea: { label: "Sea green", color: "#1f5a4a" },
  night: { label: "Night blue", color: "#1f3a66" },
  walnut: { label: "Walnut", color: "#6b4226" },
  ash: { label: "Ash", color: "#4a4a46" },
};
