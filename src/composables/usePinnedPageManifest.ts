import { onBeforeUnmount, onMounted } from "vue";

export interface PinnedPage {
  /** A web app manifest whose `start_url` and `scope` are this page. */
  manifest: string;
  /** The home-screen picture iOS uses, which reads no manifest icon. */
  appleTouchIcon: string;
  /** The name under the icon on iOS. */
  appTitle: string;
}

/**
 * Makes "Add to Home Screen" on this page pin this page, not the app.
 *
 * The app's own manifest starts at `/`, so pinning any page opens the app's
 * front door. A page meant to be its own app (the songs page) swaps in a
 * manifest scoped to itself while it is mounted, plus the two tags iOS reads
 * instead, and puts the app's back when it unmounts. A swap rather than a
 * second `<link rel="manifest">`, because a browser reads only the first.
 */
export function usePinnedPageManifest(page: PinnedPage) {
  const restore: Array<() => void> = [];

  function setLink(rel: string, href: string) {
    let link = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
    if (link) {
      const previous = link.getAttribute("href");
      const el = link;
      restore.push(() => (previous === null ? el.removeAttribute("href") : el.setAttribute("href", previous)));
    } else {
      link = document.createElement("link");
      link.rel = rel;
      document.head.appendChild(link);
      const el = link;
      restore.push(() => el.remove());
    }
    link.setAttribute("href", href);
  }

  function setMeta(name: string, content: string) {
    let meta = document.head.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
    if (meta) {
      const previous = meta.getAttribute("content");
      const el = meta;
      restore.push(() => (previous === null ? el.removeAttribute("content") : el.setAttribute("content", previous)));
    } else {
      meta = document.createElement("meta");
      meta.name = name;
      document.head.appendChild(meta);
      const el = meta;
      restore.push(() => el.remove());
    }
    meta.setAttribute("content", content);
  }

  onMounted(() => {
    setLink("manifest", page.manifest);
    setLink("apple-touch-icon", page.appleTouchIcon);
    setMeta("apple-mobile-web-app-title", page.appTitle);
    setMeta("apple-mobile-web-app-capable", "yes");
    setMeta("mobile-web-app-capable", "yes");
  });

  onBeforeUnmount(() => {
    for (const undo of restore.reverse()) undo();
    restore.length = 0;
  });
}
