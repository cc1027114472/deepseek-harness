# Agent Note: Absolute compaction threshold tokens

Status: implemented

English | [中文](2026-10-28-absolute-compaction-threshold-tokens.zh.md)

## Problem

Compaction policy previously supported only `thresholdRatio` for triggering proactive context compaction. For models with large context windows (such as 1M or 256k models), ratio-based thresholds fire at excessively high token counts unless tuned down drastically, while small-context models require higher ratios to avoid premature compaction. Furthermore, user and operational cost boundaries often require compacting conversation history at a fixed absolute token budget (for example, 80k–90k tokens) regardless of whether the model's capacity is 128k, 256k, or 1M tokens.

When users configured models with large windows, proactive compaction would not trigger until hundreds of thousands of tokens accumulated, increasing latency, API token usage, and attention degradation.

## Decision

`@deepseek-ai/dsh-compaction-basic` introduces optional `thresholdTokens` on `CompactionPolicyConfig` and `ModelCompactPolicyConfig`.

1. **Resolution and Inheritance**: `thresholdTokens` can be configured at the top-level base policy and partially overridden per model route in `modelPolicies`. Unset model policies inherit `thresholdTokens` from the base policy.
2. **Context Window Safety Clamp**: When `thresholdTokens` is configured, `resolveCompactSpec` bounds the effective threshold to `Math.min(policy.thresholdTokens, Math.floor(contextWindow * Math.max(policy.thresholdRatio, 0.95)))`. This guarantees that an absolute budget never exceeds 95% of a small context window while respecting `thresholdTokens` on large windows.
3. **Retention Validation**: If both `thresholdTokens` and absolute `retainTokens` are specified on static configuration, `retainTokens` must be strictly less than `thresholdTokens`. In `resolveCompactSpec`, the resolved retention budget (whether computed from `retainRatio` or fixed as `retainTokens`) is verified to be strictly less than the resolved `thresholdTokens`.

## Alternatives considered

- **Require only `thresholdRatio` and let users configure custom ratios per model** — rejected because calculating ratio fractions across models with varying or dynamic window sizes is error-prone, and users think in absolute token budgets for cost and latency bounds.
- **Clamp `thresholdTokens` strictly by `thresholdRatio * contextWindow`** — rejected because setting an absolute budget of 90k tokens on a 256k model with default 0.25 thresholdRatio would clamp the threshold down to 64k, defeating the explicit 90k requirement.

## Consequences

- Configurations can enforce a hard token ceiling (e.g. `thresholdTokens: 90112`) across all models, ensuring compaction triggers promptly at the desired volume.
- Existing ratio-based configurations remain fully supported as default fallback when `thresholdTokens` is omitted.
