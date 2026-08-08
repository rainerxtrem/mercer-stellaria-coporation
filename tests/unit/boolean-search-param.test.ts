import { describe, expect, it } from "vitest";

import { parseBooleanSearchParam } from "../../src/lib/boolean-search-param";

describe("parseBooleanSearchParam", () => {
  it.each([true, 1, "1", "true", "TRUE", " yes ", "on"])("accepts %j as true", (value) => {
    expect(parseBooleanSearchParam(value)).toBe(true);
  });

  it.each([false, 0, "0", "false", "FALSE", "no", "off", "", undefined, null])(
    "accepts %j as false",
    (value) => {
      expect(parseBooleanSearchParam(value)).toBe(false);
    },
  );

  it("rejects unknown values", () => {
    expect(parseBooleanSearchParam("enabled")).toBe(false);
    expect(parseBooleanSearchParam(2)).toBe(false);
  });
});
