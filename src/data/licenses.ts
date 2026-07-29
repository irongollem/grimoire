// Registry of the licenses under which third-party content in this Grimoire is
// distributed. Keys match Open5e's own license keys exactly, since our
// `content_sources` rows carry Open5e's license identifiers verbatim.
//
// Summaries are factual and plain-language — what the license permits and what
// it obliges us to do — not legal advice and not marketing copy. Keep this
// file data-only; rendering lives in src/components/rules/LicensesTab.vue.
import type { LicenseDescriptor } from "@/types/license.types";

export const LICENSES: Record<string, LicenseDescriptor> = {
  "ogl-10a": {
    key: "ogl-10a",
    name: "Open Game License 1.0a",
    shortName: "OGL 1.0a",
    url: "https://opengamingfoundation.org/ogl.html",
    summary:
      "The Open Game License 1.0a lets us reuse and adapt Open Game Content — game mechanics, not a publisher's proprietary characters, stories, or trademarks — provided we distribute a full copy of the license and keep its copyright notice updated with the title and copyright holder of every source we copy from.",
    reproducesFullText: true,
    requiredNotice: null,
  },
  "cc-by-40": {
    key: "cc-by-40",
    name: "Creative Commons Attribution 4.0 International",
    shortName: "CC BY 4.0",
    url: "https://creativecommons.org/licenses/by/4.0/",
    summary:
      "Creative Commons Attribution 4.0 International lets us copy, adapt, and redistribute the work, including for commercial use, as long as we give appropriate credit to the creator, link to the license, and note if changes were made.",
    reproducesFullText: false,
    requiredNotice: null,
  },
  orc: {
    key: "orc",
    name: "Open RPG Creative License",
    shortName: "ORC",
    url: "https://azoralaw.com/wp-content/uploads/2023/09/ORC-License.FINAL_.pdf",
    summary:
      "The ORC License is a permanent, irrevocable license to reuse and adapt Open Licensed Content, stewarded independently of any single publisher. It conditions the grant on publishing the required notice below alongside the work's attribution.",
    reproducesFullText: false,
    requiredNotice:
      "This product is licensed under the ORC License located at the Library of Congress at TX 9-307-067 and available online at various locations. All warranties are disclaimed as set forth therein.",
  },
  cc0: {
    key: "cc0",
    name: "Creative Commons Zero 1.0 Universal",
    shortName: "CC0 1.0",
    url: "https://creativecommons.org/publicdomain/zero/1.0/",
    summary:
      "Creative Commons Zero waives the creator's copyright and related rights to the fullest extent the law allows, placing the work in the public domain; crediting the creator is appreciated but not legally required.",
    reproducesFullText: false,
    requiredNotice: null,
  },
};
