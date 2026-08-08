import { describe, expect, it } from "vitest";

import { isAccessRelatedMessagingError } from "@/lib/professional-messaging.utils";

describe("isAccessRelatedMessagingError", () => {
  it("detects common authorization and not found messages", () => {
    expect(isAccessRelatedMessagingError(new Error("permission denied"))).toBe(true);
    expect(isAccessRelatedMessagingError(new Error("Conversation introuvable ou non autorisée."))).toBe(true);
    expect(isAccessRelatedMessagingError(new Error("row-level security policy failed"))).toBe(true);
  });

  it("ignores unrelated errors", () => {
    expect(isAccessRelatedMessagingError(new Error("network timeout"))).toBe(false);
    expect(isAccessRelatedMessagingError("unexpected payload")) .toBe(false);
  });
});
