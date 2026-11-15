import { describe, expect, it } from "vitest";
import { cardsFrom, importModeLabel, plural, shorterQuery, unsupportedFile } from "@/components/add/text";

describe("shorterQuery (Type a name: a search that found nothing)", () => {
  it("drops the last word of a multi-word name", () => {
    expect(shorterQuery("Arcane Signett")).toBe("Arcane");
    expect(shorterQuery("  Sol   Rnig ")).toBe("Sol");
    expect(shorterQuery("Jace, the")).toBe("Jace");
  });

  it("trims the end of a single word", () => {
    expect(shorterQuery("Signett")).toBe("Signe");
    expect(shorterQuery("Bolt")).toBe("Bol");
  });

  it("offers nothing when there's nothing shorter worth trying", () => {
    expect(shorterQuery("")).toBeUndefined();
    expect(shorterQuery("ab")).toBeUndefined();
    expect(shorterQuery("A Bolt")).toBeUndefined();
  });
});

describe("unsupportedFile (Import a file)", () => {
  it("explains spreadsheets and other non-lists before uploading", () => {
    expect(unsupportedFile("collection.xlsx")).toMatch(/spreadsheet.*CSV/);
    expect(unsupportedFile("Cards.NUMBERS")).toMatch(/spreadsheet/);
    expect(unsupportedFile("scan.jpg")).toMatch(/isn't a CSV/);
  });

  it("lets CSV and text files through", () => {
    expect(unsupportedFile("mythic_tools_bulk_export.csv")).toBeUndefined();
    expect(unsupportedFile("list.txt")).toBeUndefined();
    expect(unsupportedFile("export")).toBeUndefined();
  });
});

describe("import wording", () => {
  it("names what an import did from its stored mode", () => {
    expect(importModeLabel("add", "Mythic Tools")).toBe("Added to your collection");
    expect(importModeLabel("update", "Mythic Tools")).toBe("Updated your Mythic Tools cards");
    expect(importModeLabel("replace-source", "ManaBox")).toBe("Updated your ManaBox cards");
    expect(importModeLabel("update", "Other CSV")).toBe("Updated your cards from other CSV files");
  });

  it("reads naturally for the catch-all sources", () => {
    expect(cardsFrom("Card list")).toBe("your pasted cards");
    expect(cardsFrom("Moxfield")).toBe("your Moxfield cards");
  });

  it("pluralises counts", () => {
    expect(plural(1, "copy", "copies")).toBe("1 copy");
    expect(plural(1283, "row", "rows")).toBe("1,283 rows");
  });
});
