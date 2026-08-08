import { describe, expect, it } from "vitest";

import { hasDiscordAllAccessRole } from "../../src/backend/auth/discord";

describe("Discord all-access role matching", () => {
  it.each([
    "Chief Executive Officer",
    "Chief Human Resources Officer",
    "Chief Financial Officer",
    "Administrative Assistant",
  ])("grants all access for %s", (roleName) => {
    expect(hasDiscordAllAccessRole([roleName])).toBe(true);
  });

  it("matches role names without depending on case or surrounding spaces", () => {
    expect(hasDiscordAllAccessRole(["member", "  CHIEF FINANCIAL OFFICER "])).toBe(true);
  });

  it("does not grant access for unrelated or empty role combinations", () => {
    expect(hasDiscordAllAccessRole([])).toBe(false);
    expect(hasDiscordAllAccessRole(["member", "client", "moderator"])).toBe(false);
  });
});