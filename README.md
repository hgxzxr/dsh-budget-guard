[README.md](https://github.com/user-attachments/files/35456313/README.md)

# Token budget guard

English | [中文](README.zh.md)

A DeepSeek Harness plugin that watches the cost of **a single model reply**: when one reply used more tokens than your threshold, the next tool call pauses and asks you whether to continue or stop.

## How it decides

1. Before every tool call, the plugin reads the **most recent** `assistant/message` event from the session log.
2. Usage = `totalTokens`; when that is missing it sums `input + output + cacheRead + cacheWrite`.
3. Above `threshold` → one question with two options:
   - **Continue**: this tool call runs as usual.
   - **Stop here**: the tool call is denied, and the agent is told to stop and give a short progress summary.

The same model call is asked about only once (deduplicated by session id and event sequence).

## Configuration

Edit `cordis.patch.yml` in this directory, or override the row by id in your profile's `cordis.patch.yml`:

```yaml
- id: budget-guard
  name: '@local/budget-guard'
  config:
    threshold: 30000
```

| You want | Set |
|---|---|
| 20k | `20000` |
| 100k | `100000` |
| 500k | `500000` |

`threshold` is in tokens and defaults to `100000`. An override replaces the whole `config` of the row, so repeat `unitNote` if you rely on it.

## Install

Requires a profile that mounts `userQuestions` (the standard preset ships with it).

1. Clone this repository.
2. Install the `dsh-budget-guard` folder as a local bundle in DSH's plugin manager, then enable it.
3. Restart DSH: the plugin loads at startup and code changes need a restart.

## Limitations

- Numbers come from provider-reported usage; when `totalTokens` is absent the sum can undercount cached tokens.
- It only triggers when a tool call follows. A long text-only reply is never interrupted midway.
- Without `userQuestions` the question cannot be shown, and the guard lets work continue.
- The question text and the two option labels are currently written in Chinese only.
