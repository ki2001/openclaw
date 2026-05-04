import { describe, expect, it } from "vitest";
import { EmbeddedRunStageName } from "./attempt-stage-timing.js";

describe("embedded run stage timing", () => {
  it("keeps required reply prep stage names stable", () => {
    expect(Object.values(EmbeddedRunStageName)).toEqual(
      expect.arrayContaining([
        "model-selection",
        "auth-resolution",
        "provider-runtime-lookup",
        "tool-planning",
        "tool-materialization",
        "plugin-capability-loading",
        "workspace-session-prep",
        "harness-prep",
        "active-run-registration",
        "model-execution",
      ]),
    );
  });
});
