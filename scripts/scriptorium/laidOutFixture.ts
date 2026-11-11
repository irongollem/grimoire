import type { ExpectedPage } from "../../src/scriptorium/lib/printCheck";

/** What the browser page hands the print test: the document to print and what each laid-out page says. */
export interface LaidOutFixture {
  html: string;
  expected: ExpectedPage[];
}
