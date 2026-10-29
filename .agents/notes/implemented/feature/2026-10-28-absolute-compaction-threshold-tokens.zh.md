# Agent Note: 绝对压缩阈值 Token 预算

Status: implemented

[English](2026-10-28-absolute-compaction-threshold-tokens.md) | 中文

## Problem

此前的上下文压缩策略仅支持基于 `thresholdRatio` 的比例触发主动压缩。对于拥有超大上下文窗口的模型（例如 1M 或 256k 模型），基于比例的阈值会导致会话必须积累到极高的 Token 量才会触发压缩；而小上下文模型又需要较高的比例以避免过早压缩。此外，在实际使用与成本管控中，用户往往希望在固定的绝对 Token 预算（例如 80k–90k tokens）处触发压缩，而不论模型额定窗口是 128k、256k 还是 1M。

当用户使用大窗口模型时，主动压缩迟迟不被触发，造成高额 API 成本、延迟上升以及长上下文注意力退化。

## Decision

`@deepseek-ai/dsh-compaction-basic` 在 `CompactionPolicyConfig` 与 `ModelCompactPolicyConfig` 中引入了可选的 `thresholdTokens` 字段。

1. **解析与继承**：`thresholdTokens` 可在顶层基础策略中配置，并在 `modelPolicies` 中按精确模型路由进行局部覆盖。未设置的模型策略自动继承基础策略中的 `thresholdTokens`。
2. **上下文窗口安全限制**：当配置了 `thresholdTokens` 时，`resolveCompactSpec` 将实际生效阈值限制为 `Math.min(policy.thresholdTokens, Math.floor(contextWindow * Math.max(policy.thresholdRatio, 0.95)))`。这既确保了绝对预算不会超出小上下文窗口的 95%，又能在较大窗口下严格遵循 `thresholdTokens`。
3. **保留预算校验**：若静态配置中同时指定了 `thresholdTokens` 与绝对 `retainTokens`，则 `retainTokens` 必须严格小于 `thresholdTokens`。在 `resolveCompactSpec` 运行时计算中，解析得到的保留 Token 预算（无论来自 `retainRatio` 还是 `retainTokens`）均必须严格小于解析出的 `thresholdTokens`。

## Alternatives considered

- **仅依赖 `thresholdRatio` 并让用户为各模型配置单独比例** —— 否决，因为跨不同动态窗口大小换算比例繁琐且容易出错，且用户的实际诉求是以固定的绝对 Token 额度控制成本与延迟。
- **使用 `thresholdRatio * contextWindow` 严格限制 `thresholdTokens`** —— 否决，因为若默认 `thresholdRatio` 为 0.25，在 256k 模型上配置 90k 阈值会被不合理地下限削减至 64k，违背了指定 90k 的预期。

## Consequences

- 配置文件可跨所有模型统一部署绝对 Token 上限（例如 `thresholdTokens: 90112`），确保会话在达到指定大小后即刻触发压缩。
- 未指定 `thresholdTokens` 的旧配置继续保持原有的基于比例的默认回退行为。
