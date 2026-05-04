import { describe, expect, it, vi } from "vitest";
import { createStageTracker, emitStageSummary } from "./stage-timing.js";

describe("stage timing", () => {
  it("captures stage duration and elapsed time", () => {
    let clock = 10;
    const tracker = createStageTracker({ now: () => clock });

    clock = 25;
    tracker.mark("workspace");
    clock = 40;
    tracker.mark("tools");
    clock = 45;

    expect(tracker.snapshot()).toEqual({
      totalMs: 35,
      stages: [
        { name: "workspace", durationMs: 15, elapsedMs: 15 },
        { name: "tools", durationMs: 15, elapsedMs: 30 },
      ],
    });
  });

  it("emits normal summaries through the configured level", () => {
    const logger = {
      isEnabled: (level: "debug" | "trace") => level === "debug",
      debug: vi.fn(),
      trace: vi.fn(),
      warn: vi.fn(),
    };

    expect(
      emitStageSummary({
        logger,
        prefix: "run stages: runId=r1",
        summary: {
          totalMs: 80,
          stages: [{ name: "model-execution", durationMs: 55, elapsedMs: 80 }],
        },
      }),
    ).toBe(true);
    expect(logger.debug).toHaveBeenCalledWith(
      "run stages: runId=r1 totalMs=80 stages=model-execution:55ms@80ms",
    );
    expect(logger.trace).not.toHaveBeenCalled();
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it("emits slow summaries as warnings", () => {
    const logger = {
      isEnabled: vi.fn(() => false),
      debug: vi.fn(),
      trace: vi.fn(),
      warn: vi.fn(),
    };

    expect(
      emitStageSummary({
        logger,
        prefix: "run stages: runId=r1",
        summary: {
          totalMs: 10,
          stages: [{ name: "auth", durationMs: 5_000, elapsedMs: 5_000 }],
        },
      }),
    ).toBe(true);
    expect(logger.warn).toHaveBeenCalledWith(
      "run stages: runId=r1 totalMs=10 stages=auth:5000ms@5000ms",
    );
    expect(logger.debug).not.toHaveBeenCalled();
    expect(logger.trace).not.toHaveBeenCalled();
  });
});
