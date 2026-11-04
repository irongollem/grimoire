/**
 * The page a scene is drawn in: `/?scene=<id>` plays it live, `&film` waits to be stepped frame by frame
 * by film.ts through `window.scene`. Layer images come from `/art/`.
 */
import { SCENES } from "../catalog.ts";
import type { Scene } from "../scene.ts";
import { drawScene, loadImages, play } from "./render.ts";

/** What film.ts calls in the page. */
export interface FilmHandle {
  /** Resolves once every image has loaded; rejects naming what is missing. */
  ready: Promise<void>;
  /** Draws the frame at `t` seconds and returns it as a JPEG data URL. */
  frame(t: number, quality: number): string;
  /** Draws the frame at `t` seconds and returns it as a PNG data URL. */
  still(t: number): string;
}

declare global {
  interface Window {
    scene: FilmHandle;
  }
}

const params = new URLSearchParams(location.search);

function sceneNamed(id: string | null): Scene {
  const found = SCENES.find((s) => s.id === id);
  if (!found) throw new Error(`No scene "${id}". Scenes: ${SCENES.map((s) => s.id).join(", ")}`);
  return found;
}

function need<T>(value: T | null, what: string): T {
  if (value === null) throw new Error(`The scene page has no ${what}`);
  return value;
}

const scene = sceneNamed(params.get("scene"));
const canvas = need(document.querySelector("canvas"), "canvas");
canvas.width = scene.size.width;
canvas.height = scene.size.height;
const ctx = need(canvas.getContext("2d"), "2D canvas context");

const images = loadImages(scene, "/art/");
let loaded: Awaited<typeof images> | null = null;

/** Draws synchronously, so the canvas read straight after holds this frame and not the one before. */
function drawNow(t: number): void {
  if (!loaded) throw new Error("Scene images are still loading: await window.scene.ready first.");
  drawScene(ctx, scene, loaded, t);
}

window.scene = {
  ready: images.then((ready) => {
    loaded = ready;
    drawNow(0);
  }),
  frame(t, quality) {
    drawNow(t);
    return canvas.toDataURL("image/jpeg", quality);
  },
  still(t) {
    drawNow(t);
    return canvas.toDataURL("image/png");
  },
};

if (!params.has("film")) void images.then((loaded) => play(canvas, scene, loaded));
