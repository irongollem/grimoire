/*
 * How a picture sits on the paper (#1176 story 9c). "Printed into the paper"
 * draws it with mix-blend-mode multiply, so the paper's grain and colour show
 * through as if it were printed on it; "On top" draws it as it is.
 *
 * Art behind the text has always been multiplied into the paper (so text over
 * it reads on every paper), so for that the default is "paper" and nothing
 * looks different. Every other picture defaults to "top".
 */
export type PictureBlend = "paper" | "top";

export const PICTURE_BLENDS: readonly PictureBlend[] = ["paper", "top"];

export function asBlend(value: unknown): PictureBlend | null {
  return PICTURE_BLENDS.find((b) => b === value) ?? null;
}

/** The blend of a picture in the text: only what was chosen. */
export function imageBlend(attrs: Readonly<Record<string, unknown>>): PictureBlend {
  return asBlend(attrs.blend) ?? "top";
}

/** The blend of art on the page: what was chosen, else "paper" behind the text and "top" in front of it. */
export function artBlend(item: { z: "under" | "over"; props: Readonly<Record<string, unknown>> }): PictureBlend {
  return asBlend(item.props.blend) ?? (item.z === "under" ? "paper" : "top");
}
