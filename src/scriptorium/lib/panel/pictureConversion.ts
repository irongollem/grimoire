/*
 * The two shapes of a picture, and the way across (#1176).
 *
 * Pure: the editor-touching half (where in the text, which page) is
 * `useEditorPictures`. Here are only the values that cross.
 */
import type { PageFurnitureItem } from "@/scriptorium/types";
import { asBlend } from "@/scriptorium/lib/furniture/blend";
import { pickTreatment } from "@/scriptorium/lib/panel/pictureTreatment";

/** The props of art placed from an image node's attrs: its file and its treatment. */
export function furniturePropsFromImage(attrs: Readonly<Record<string, unknown>>): PageFurnitureItem["props"] | null {
  const src = attrs.src;
  if (typeof src !== "string" || src === "") return null;
  // The recipe's own values are not strings or numbers; furniture props are typed for the common kinds only.
  // An explicit blend travels; none means the destination's default (art behind the text is multiplied by default).
  const blend = asBlend(attrs.blend);
  return { src, ...pickTreatment(attrs), ...(blend ? { blend } : {}) } as PageFurnitureItem["props"];
}

/** The attrs of an image node made from art furniture: width % of the page to px, the treatment across unchanged. */
export function imageAttrsFromFurniture(
  item: Pick<PageFurnitureItem, "width" | "props">,
  pageWidthPx: number,
): Record<string, unknown> | null {
  const src = item.props.src;
  if (typeof src !== "string" || src === "") return null;
  const blend = asBlend(item.props.blend);
  return {
    src,
    ...(blend ? { blend } : {}),
    width: String(Math.max(1, Math.round((item.width / 100) * pageWidthPx))),
    dataAlign: "center",
    layoutMode: "inline",
    ...pickTreatment(item.props),
  };
}
