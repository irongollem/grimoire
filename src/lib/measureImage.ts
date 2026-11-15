/** The natural size of an image at a URL, in pixels. Rejects when it cannot be loaded or has no size. */
export function measureImage(src: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      if (!img.naturalWidth || !img.naturalHeight) reject(new Error("The picture has no size."));
      else resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => reject(new Error("The picture could not be loaded."));
    img.src = src;
  });
}
