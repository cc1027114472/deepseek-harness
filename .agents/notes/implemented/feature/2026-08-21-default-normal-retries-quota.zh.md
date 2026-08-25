# Agent Note: 默认 normal 策略重试 QUOTA

Status: implemented

[English](2026-08-21-default-normal-retries-quota.md) | 中文

## 问题

提供方有时在账户仍在恢复、或同级路由仍有额度时，返回带 `insufficient_quota`（或等价措辞）的 HTTP 429。harness 将这些失败归类为 `QUOTA`，以便与暂时性的 `RATE_LIMIT` 区分，但默认 normal 的 `retryableCodes` 列表省略了 `QUOTA`。因此 UI 会立刻失败且不出现重试标记，即便运维方期望它使用与其他默认可重试 code 相同的有限预算。

## 决策

`DEFAULT_RETRYABLE_CODES` 在 `EMPTY_RESPONSE`、`RATE_LIMIT`、`SERVER`、`TIMEOUT` 和 `TRANSPORT` 之外包含 `QUOTA`。`DEFAULT_MAX_RETRIES` 为 `7`。分类仍使用 `isQuotaExceededError`，因此配额耗尽不会并入 `RATE_LIMIT`；变化的只是默认可恢复成员集合。必须对配额立即失败的部署，可在显式 normal `retryableCodes` 列表中省略 `QUOTA`，或继续用 always mode 做无界重试。

这修正了[按提供方的请求重试策略](2026-07-24-provider-retry-policies.md)中描述的默认成员集合。

## 曾考虑的替代方案

**继续把 `QUOTA` 留在默认列表之外**：不予采纳。对产品路径而言，运维方已把许多配额类 429 视为值得短时重试预算的失败；若列表不含该 code，则有限的 `maxRetries` 调整对用户实际看到的失败不可见。

**把配额并入 `RATE_LIMIT`**：不予采纳，因为计费／耗尽措辞必须在诊断中可区分，也便于仍希望从重试成员中省略配额的部署。

**要求每个组合在 cordis.yml 中显式加入 `QUOTA`**：不予采纳，因为省略配置本就定义产品默认值，强迫每个叶子配置重述列表会在所属常量之外重复策略。

## 后果

默认 normal 恢复会在配额失败上最多重试七次，然后委托后续处理。always mode 对任何有限策略之外的失败仍无界。固定默认 `retryableCodes` 列表的测试必须包含 `QUOTA`。
