import { createSSRApp, h } from "vue";
import { renderToString } from "vue/server-renderer";
import { SONG_PICTURES } from "@/lib/icons";

/** SONG_PICTURES as SVG markup, drawn the way the songs page draws them (white strokes on the tile colour). */
export async function renderSongPictures(): Promise<string[]> {
  const out: string[] = [];
  for (const Picture of SONG_PICTURES) {
    const html = await renderToString(createSSRApp({ render: () => h(Picture, { "stroke-width": 1.75 }) }));
    // Vue's SSR comment markers and the component class names mean nothing to a static page.
    out.push(html.replace(/<!--[\s\S]*?-->/g, "").replace(/ class="[^"]*"/g, ""));
  }
  return out;
}
