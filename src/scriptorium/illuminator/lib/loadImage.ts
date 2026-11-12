import type { DecodedImage } from "./textureOverlay";

/** Loads a picture by URL into something a canvas can draw. Injected so the pipeline runs anywhere. */
export type LoadImage = (url: string) => Promise<DecodedImage>;

/** Main thread: an <img> read with CORS so the canvas stays readable (the CDN allows it). */
export const loadDomImage = (url: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`could not load ${url}`));
    img.src = url;
  });

/** Worker: no <img> there, so fetch the bytes and decode them to a bitmap. */
export const loadBitmapImage: LoadImage = async (url) => {
  const res = await fetch(url, { mode: "cors" });
  if (!res.ok) throw new Error(`could not load ${url} (${res.status})`);
  return createImageBitmap(await res.blob());
};
