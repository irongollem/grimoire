/** Same pattern as the `open_books.slug` check: 1 to 48 of a-z, 0-9 and inner hyphens. */
export const OPEN_BOOK_SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?$/;
export const OPEN_BOOK_SLUG_MAX = 48;

export function isValidOpenBookSlug(slug: string): boolean {
  return OPEN_BOOK_SLUG_PATTERN.test(slug);
}

/** A first suggestion for a slug from a book's title: lowercase, accents folded, runs of anything else a hyphen. */
export function slugifyOpenBookTitle(title: string): string {
  return title
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+/, "")
    .slice(0, OPEN_BOOK_SLUG_MAX)
    .replace(/-+$/, "");
}
