# Agent Note: Default normal policy retries QUOTA

Status: implemented

English | [中文](2026-08-21-default-normal-retries-quota.zh.md)

## Problem

Providers sometimes return HTTP 429 with `insufficient_quota` (or equivalent wording) while the account still recovers or a sibling route still has budget. The harness classifies those failures as `QUOTA` so they stay distinct from transient `RATE_LIMIT`, but the default normal `retryableCodes` list omitted `QUOTA`. The UI therefore failed immediately with no retry badge, even though operators expected the same finite budget used for other default codes.

## Decision

`DEFAULT_RETRYABLE_CODES` includes `QUOTA` alongside `EMPTY_RESPONSE`, `RATE_LIMIT`, `SERVER`, `TIMEOUT`, and `TRANSPORT`. `DEFAULT_MAX_RETRIES` is `7`. Classification still uses `isQuotaExceededError` so quota exhaustion never collapses into `RATE_LIMIT`; only the default recovery membership changes. Deployments that must fail closed on quota omit `QUOTA` from an explicit normal `retryableCodes` list, or keep always mode for unbounded retry.

This amends the default membership described in [per-provider request retry policies](2026-07-24-provider-retry-policies.md).

## Alternatives considered

**Keep `QUOTA` out of the default list** — rejected for the product path: operators already treat many quota 429s as worth a short retry budget, and leaving the code out made the finite `maxRetries` change invisible for the failure users actually see.

**Collapse quota into `RATE_LIMIT`** — rejected because billing/exhaustion wording must stay distinguishable for diagnostics and for deployments that still want to omit quota from retry membership.

**Require every composition to opt into `QUOTA` in cordis.yml** — rejected because omission already defines the product default, and forcing every leaf config to restate the list duplicates policy outside the owning constant.

## Consequences

Default normal recovery spends up to seven retries on quota failures before delegating. Always mode remains unbounded for failures outside any finite policy. Tests that pin the default `retryableCodes` list must include `QUOTA`.
