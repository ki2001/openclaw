/**
 * Structured decision returned by gate/policy hooks.
 * Core is outcome-agnostic — it handles the mechanics of each outcome
 * without knowing *why* the decision was made.
 */
export type HookDecision = HookDecisionPass | HookDecisionBlock;

/** Content is fine. Proceed normally. */
export type HookDecisionPass = {
  outcome: "pass";
};

/** Default user-facing replacement message when a `block` decision omits one. */
export const DEFAULT_BLOCK_MESSAGE = "This request was blocked by policy";

/**
 * Content is blocked. `reason` is internal; `message` is user-facing.
 */
export type HookDecisionBlock = {
  outcome: "block";
  /** Internal reason for logging/observability. Never shown to user. */
  reason: string;
  /** Optional user-facing replacement text. Defaults to `DEFAULT_BLOCK_MESSAGE`. */
  message?: string;
  /** Plugin-defined category for analytics (e.g. "violence", "pii", "cost_limit"). */
  category?: string;
  /** Opaque metadata for the plugin's own use. Core does not interpret it. */
  metadata?: Record<string, unknown>;
};

export function resolveBlockMessage(decision: HookDecisionBlock): string {
  return decision.message ?? DEFAULT_BLOCK_MESSAGE;
}

/** Outcome severity for most-restrictive-wins merging. Higher = more restrictive. */
export const HOOK_DECISION_SEVERITY: Record<HookDecision["outcome"], number> = {
  pass: 0,
  block: 2,
};

/**
 * Merge two HookDecisions using most-restrictive-wins semantics.
 * `block > pass`
 */
export function mergeHookDecisions(a: HookDecision | undefined, b: HookDecision): HookDecision {
  if (!a) {
    return b;
  }
  return HOOK_DECISION_SEVERITY[b.outcome] > HOOK_DECISION_SEVERITY[a.outcome] ? b : a;
}

/**
 * Type guard: does this object look like a HookDecision (has `outcome` field)?
 */
export function isHookDecision(value: unknown): value is HookDecision {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const v = value as Record<string, unknown>;
  return v.outcome === "pass" || v.outcome === "block";
}

/** Outcomes valid for input gates (before_agent_run). */
export type InputGateDecision = HookDecisionPass | HookDecisionBlock;

/**
 * A gate hook decision paired with the pluginId that produced it.
 * Returned by gate hook runners so callers can
 * attribute blocked entries and audit events to the originating plugin.
 */
export type GateHookResult<TDecision extends HookDecision = HookDecision> = {
  decision: TDecision;
  pluginId: string;
};

/**
 * Entry written to the per-session redaction audit log.
 * Contains hashes, not content (the redacted content is gone forever).
 */
export type RedactionAuditEntry = {
  /** Timestamp of the redaction. */
  ts: number;
  /** The hook point that triggered the redaction. */
  hookPoint: string;
  /** Which plugin requested the redaction. */
  pluginId: string;
  /** Internal reason for the redaction. */
  reason: string;
  /** Plugin-defined category. */
  category?: string;
  /** SHA-256 hash of the redacted content (not the content itself). */
  contentHash?: string;
  /** Number of messages removed from the transcript. */
  messagesRemoved: number;
};
