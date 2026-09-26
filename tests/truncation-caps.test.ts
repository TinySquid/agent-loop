import { describe, expect, it } from "vitest";
import { TRUNCATION_CAPS } from "../src/tools/truncate.js";

describe("TRUNCATION_CAPS as a bundle", () => {
  it("carries the shared truncation caps as one object", () => {
    // the clump this type was born from: three fields that always travel together
    expect(TRUNCATION_CAPS).toEqual({
      maxLines: 2000,
      maxBytes: 50 * 1024,
      maxLineChars: 2000
    });
  });
});
