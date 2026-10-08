/**
 * Self-hosted web fonts (@fontsource) — the same families and weights the app
 * used to pull from fonts.googleapis.com.
 *
 * They are bundled rather than loaded from Google on purpose: a browser that
 * fetches a Google Fonts stylesheet hands the visitor's IP address to Google
 * before they have agreed to anything, and LG München I (3 O 17493/20,
 * 20 Jan 2022) held that to be a GDPR violation, awarding the visitor damages.
 * Serving the files from our own origin sends no personal data anywhere.
 *
 * Imported from JS rather than `@import`ed into main.css: Vite rewrites each
 * package's relative `url(./files/…)` to a hashed asset only when it owns the
 * import, and main.css is also pulled in by `@reference` from dozens of SFCs.
 *
 * Each file declares every unicode subset with a `unicode-range`, so a browser
 * downloads only the subsets a page actually renders. The declarations
 * themselves are not free, though — they ship in the boot CSS — so a family
 * with a very large script (Shippori Mincho) imports just the subsets used. Add a weight here before using
 * it in CSS; there is no CDN behind this to fall back on.
 */
import "@fontsource/cinzel/400.css";
import "@fontsource/cinzel/500.css";
import "@fontsource/cinzel/600.css";
import "@fontsource/cinzel/700.css";
import "@fontsource/cinzel/800.css";
import "@fontsource/cinzel/900.css";

import "@fontsource/cormorant-garamond/400.css";
import "@fontsource/cormorant-garamond/500.css";
import "@fontsource/cormorant-garamond/600.css";
import "@fontsource/cormorant-garamond/700.css";
import "@fontsource/cormorant-garamond/400-italic.css";
import "@fontsource/cormorant-garamond/500-italic.css";
import "@fontsource/cormorant-garamond/600-italic.css";

import "@fontsource/cardo/400.css";
import "@fontsource/cardo/400-italic.css";

import "@fontsource/unifrakturcook/700.css";

// The DM's hand in Vellum (epic #1031): one weight only, never synthesized bold.
import "@fontsource/fondamento/400.css";

import "@fontsource/crimson-pro/300.css";
import "@fontsource/crimson-pro/400.css";
import "@fontsource/crimson-pro/600.css";
import "@fontsource/crimson-pro/700.css";
import "@fontsource/crimson-pro/300-italic.css";
import "@fontsource/crimson-pro/400-italic.css";
import "@fontsource/crimson-pro/600-italic.css";
import "@fontsource/crimson-pro/700-italic.css";

import "@fontsource/alegreya/400.css";
import "@fontsource/alegreya/500.css";
import "@fontsource/alegreya/700.css";
import "@fontsource/alegreya/400-italic.css";
import "@fontsource/alegreya/700-italic.css";

import "@fontsource/eb-garamond/400.css";
import "@fontsource/eb-garamond/500.css";
import "@fontsource/eb-garamond/600.css";
import "@fontsource/eb-garamond/400-italic.css";

// Latin subsets only: the sumi-e sheet theme (sheetTypes.ts) sets Latin text in
// it, and the full files declare 122 Japanese subsets per weight — 366
// @font-face rules, ~150 KB of gzipped render-blocking CSS on every first load.
// Japanese text in that theme falls back to the system serif.
import "@fontsource/shippori-mincho/latin-500.css";
import "@fontsource/shippori-mincho/latin-600.css";
import "@fontsource/shippori-mincho/latin-700.css";
import "@fontsource/shippori-mincho/latin-ext-500.css";
import "@fontsource/shippori-mincho/latin-ext-600.css";
import "@fontsource/shippori-mincho/latin-ext-700.css";

import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import "@fontsource/inter/800.css";

import "@fontsource/source-sans-3/400.css";
import "@fontsource/source-sans-3/500.css";
import "@fontsource/source-sans-3/600.css";
import "@fontsource/source-sans-3/700.css";
import "@fontsource/source-sans-3/400-italic.css";
import "@fontsource/source-sans-3/500-italic.css";
