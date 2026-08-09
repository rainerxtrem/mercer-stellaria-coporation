import { describe, expect, it } from "vitest";

import { authenticatedServerFnHeaders } from "@/integrations/supabase/auth-attacher";

describe("authenticatedServerFnHeaders", () => {
  it("transports the selected enterprise with the bearer token", () => {
    expect(
      authenticatedServerFnHeaders("access-token", "11111111-1111-4111-8111-111111111111"),
    ).toEqual({
      Authorization: "Bearer access-token",
      "x-enterprise-id": "11111111-1111-4111-8111-111111111111",
    });
  });

  it("omits unavailable authentication context", () => {
    expect(authenticatedServerFnHeaders(null, null)).toEqual({});
  });
});
