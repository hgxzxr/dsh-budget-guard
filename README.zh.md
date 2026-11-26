# Token 预算守卫

[English](README.md) | 中文

按**单次模型调用**的用量判断：一次回复用掉多少 token，超过你设的数就停下来问你。

## 怎么判断

1. 每次工具调用前，从会话日志里取**最近一次** `assistant/message` 的 `usage`。
2. 用量 = `totalTokens`，缺失时用 `input + output + cacheRead + cacheWrite`。
3. 超过 `threshold` → 弹一个问题，两个选项：
   - **继续（放行这次）**：这次工具调用照常执行
   - **停在这里（结束本轮）**：该工具调用返回错误，我停下并给进度小结

同一个模型调用只问一次（按会话 + 事件序号去重）。

## 改阈值

编辑本目录的 `cordis.patch.yml`，或在 profile 的 `cordis.patch.yml` 里按 id 覆盖：

```yaml
- id: budget-guard
  name: '@local/budget-guard'
  config:
    threshold: 30000
```

| 想要 | 填 |
|---|---|
| 2 万 | `20000` |
| 10 万 | `100000` |
| 50 万 | `500000` |

`threshold` 单位是 token，默认 `100000`。按 id 覆盖会替换整行 `config`，如果要用 `unitNote` 需要一起重写。

## 安装

需要 profile 里挂载了 `userQuestions`（标准预设自带）。

1. 克隆本仓库。
2. 在 DSH 的插件管理里把 `dsh-budget-guard` 目录作为本地 bundle 安装，然后启用。
3. 重启 DSH：插件在启动时加载，改代码必须重启才生效。

## 限制

- 数字来自 provider 上报的 usage，比估算准；但 `totalTokens` 缺失时用各项相加，可能少算缓存。
- 只在有工具调用时才会弹；纯文字的长回复不会中途打断。
- 没挂 `userQuestions` 时问题弹不出来，守卫会放行，不阻塞工作。
- 问题文案和两个选项目前是写死的中文。
