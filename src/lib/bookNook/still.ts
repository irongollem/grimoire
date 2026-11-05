/**
 * A nook's still: its first frame with every cut-out in place, seen through the wide window (#1142). It is what
 * lists, cards, reduce-motion and a place's picture show, so nothing outside the player needs to read a scene
 * ("Saving a nook that a place shows writes its first frame, every cut-out in place, to the place's picture").
 */
import { windowFor } from "./framing";
import { drawScene, type Images } from "./render";
import type { Scene } from "./scene";

/** Wide enough for a TV's still and a card's; a still is a picture, not the moving thing. */
export const STILL_WIDTH = 1600;

/** The canvas size of the still: the wide window's shape at `STILL_WIDTH`. */
export function stillSize(scene: Scene): { width: number; height: number } {
  const window = windowFor(scene, "wide");
  return { width: STILL_WIDTH, height: Math.round((STILL_WIDTH * window.h) / window.w) };
}

/**
 * The first frame, drawn without the frame (a still is shown small and in place, where the frame never is) and
 * without breathing, so it is the room at rest. Rejects when the canvas cannot be encoded.
 */
export function composeStill(scene: Scene, images: Images): Promise<Blob> {
  const { width, height } = stillSize(scene);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return Promise.reject(new Error("No 2D canvas to draw the still on."));
  const atRest: Scene = { ...scene, frame: undefined };
  drawScene(ctx, atRest, images, 0, { window: windowFor(scene, "wide"), breathe: 0 });
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("The still could not be encoded."))), "image/webp", 0.86);
  });
}
