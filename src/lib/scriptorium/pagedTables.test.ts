// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { promoteTableHeaders, COLUMN_SHORT_MAX, LONG_TABLE_ROW_THRESHOLD } from "./pagedTables";

describe("promoteTableHeaders", () => {
  it("returns the html unchanged when there is no table", () => {
    const html = "<p>No tables here.</p>";
    expect(promoteTableHeaders(html)).toBe(html);
  });

  it("promotes a single leading all-th row into a real thead", () => {
    const html =
      "<table><tbody>" +
      "<tr><th>Name</th><th>CR</th></tr>" +
      "<tr><td>Owlbear</td><td>3</td></tr>" +
      "</tbody></table>";
    const out = promoteTableHeaders(html);
    const root = document.createElement("div");
    root.innerHTML = out;
    const thead = root.querySelector("thead");
    expect(thead).toBeTruthy();
    expect(thead!.querySelectorAll("tr")).toHaveLength(1);
    expect(root.querySelector("tbody")!.querySelectorAll("tr")).toHaveLength(1);
  });

  it("promotes a two-row leading header (colspan/rowspan) as one thead", () => {
    const html =
      "<table><tbody>" +
      '<tr><th rowspan="2">Level</th><th colspan="2">Spell Slots</th></tr>' +
      "<tr><th>1st</th><th>2nd</th></tr>" +
      "<tr><td>1</td><td>2</td><td>0</td></tr>" +
      "</tbody></table>";
    const out = promoteTableHeaders(html);
    const root = document.createElement("div");
    root.innerHTML = out;
    expect(root.querySelector("thead")!.querySelectorAll("tr")).toHaveLength(2);
    expect(root.querySelector("tbody")!.querySelectorAll("tr")).toHaveLength(1);
  });

  it("leaves a table with no header row alone (no thead)", () => {
    const html = "<table><tbody><tr><td>a</td><td>b</td></tr></tbody></table>";
    const out = promoteTableHeaders(html);
    expect(out).not.toContain("<thead");
  });

  it("does not touch a table that already has a thead", () => {
    const html = "<table><thead><tr><th>X</th></tr></thead><tbody><tr><td>y</td></tr></tbody></table>";
    expect(promoteTableHeaders(html)).toBe(html);
  });

  it(`marks a column short (sc-table-col-center) when every body cell is <= ${COLUMN_SHORT_MAX} chars`, () => {
    const html =
      "<table><tbody>" +
      "<tr><th>Rank</th><th>Description</th></tr>" +
      "<tr><td>1st</td><td>A long descriptive sentence about the feature.</td></tr>" +
      "<tr><td>2nd</td><td>Another sentence, also long.</td></tr>" +
      "</tbody></table>";
    const out = promoteTableHeaders(html);
    const root = document.createElement("div");
    root.innerHTML = out;
    const rows = Array.from(root.querySelectorAll("tbody tr"));
    for (const row of rows) {
      expect(row.children[0].classList.contains("sc-table-col-center")).toBe(true);
      expect(row.children[1].classList.contains("sc-table-col-left")).toBe(true);
    }
  });

  it("skips column classification for a table using colspan/rowspan", () => {
    const html =
      "<table><tbody>" +
      '<tr><th rowspan="2">Level</th><th colspan="2">Slots</th></tr>' +
      "<tr><th>1st</th><th>2nd</th></tr>" +
      "<tr><td>1</td><td>2</td><td>0</td></tr>" +
      "</tbody></table>";
    const out = promoteTableHeaders(html);
    expect(out).not.toContain("sc-table-col-center");
    expect(out).not.toContain("sc-table-col-left");
  });

  function tableWithRows(n: number): string {
    const rows = Array.from({ length: n - 1 }, (_, i) => `<tr><td>${i}</td></tr>`).join("");
    return `<table><tbody><tr><th>Header</th></tr>${rows}</tbody></table>`;
  }

  it(`leaves a table at or below ${LONG_TABLE_ROW_THRESHOLD} total rows unclassified`, () => {
    const out = promoteTableHeaders(tableWithRows(LONG_TABLE_ROW_THRESHOLD));
    expect(out).not.toContain("sc-table--long");
  });

  it(`classifies a table above ${LONG_TABLE_ROW_THRESHOLD} total rows sc-table--long`, () => {
    const out = promoteTableHeaders(tableWithRows(LONG_TABLE_ROW_THRESHOLD + 1));
    expect(out).toContain("sc-table--long");
  });

  it("never classifies a table that already has its own thead (a specialised, always-short table)", () => {
    const rows = Array.from({ length: LONG_TABLE_ROW_THRESHOLD + 5 }, (_, i) => `<tr><td>${i}</td></tr>`).join("");
    const html = `<table class="sc-ability-table"><thead><tr><th>X</th></tr></thead><tbody>${rows}</tbody></table>`;
    expect(promoteTableHeaders(html)).not.toContain("sc-table--long");
  });

  it("classifies a long table using colspan/rowspan too (row count doesn't depend on column classification)", () => {
    const rows = Array.from(
      { length: LONG_TABLE_ROW_THRESHOLD },
      () => '<tr><td colspan="2">x</td></tr>',
    ).join("");
    const html = `<table><tbody><tr><th rowspan="2">Level</th><th colspan="2">Slots</th></tr>${rows}</tbody></table>`;
    expect(promoteTableHeaders(html)).toContain("sc-table--long");
  });
});
