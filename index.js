/**
 * Budget guard: watch the token cost of each model call.
 *
 * Before a tool call runs, the plugin reads the most recent completed model call
 * from the session log and sums its provider-reported usage. When that single
 * call used more than `threshold`, the tool call first asks you through
 * `ctx.userQuestions` (the same channel `ask_user_question` uses, so the answer
 * does not depend on the approval policy): continue this turn, or stop.
 *
 * @module @local/budget-guard
 */

/** Plugin name. */
export const name = 'budget-guard'

/** Required services: the tool registry we gate, and the user-question channel. */
export const inject = ['tools', 'userQuestions']

const CONTINUE = '继续（放行这次）'
const STOP = '停在这里（结束本轮）'
const ASKED = new Set()

function formatTokens(value) {
  return Math.round(value).toLocaleString('en-US')
}

/**
 * Sum one provider-reported usage record into a single billed figure.
 * @param usage - `TokenUsage` carried by an `assistant/message` event.
 * @returns total tokens, or 0 when the record cannot be read.
 */
function totalOf(usage) {
  if (usage === undefined || usage === null || typeof usage !== 'object') return 0
  const num = (key) => (typeof usage[key] === 'number' && Number.isFinite(usage[key]) ? usage[key] : 0)
  const exact = num('totalTokens')
  if (exact > 0) return exact
  return num('inputTokens') + num('outputTokens') + num('cacheReadTokens') + num('cacheWriteTokens')
}

/**
 * Read the newest completed model call's usage from the session log.
 * @param session - the live session.
 * @returns the call's sequence and total tokens, or undefined when no call is logged.
 */
function lastCall(session) {
  let end = -1
  try {
    end = Number(session.seq)
  } catch {
    return undefined
  }
  if (!Number.isFinite(end)) return undefined
  for (let seq = end - 1; seq >= 0; seq -= 1) {
    let event
    try {
      event = session.eventAt(seq)
    } catch {
      return undefined
    }
    if (event === undefined || event === null) continue
    if (event.type !== 'assistant/message') continue
    const total = totalOf(event.usage)
    if (total <= 0) continue
    return { seq, total }
  }
  return undefined
}

/** Build the two-option question shown when one call went over budget. */
function budgetQuestion(call, threshold, note) {
  const lines = [
    `上一次模型调用用了 ${formatTokens(call.total)} token，超过你设定的单次上限 ${formatTokens(threshold)}。`,
    '',
    '选「继续」我就放行这次工具调用；选「停在这里」我立刻停下并给你进度小结。',
  ]
  if (note !== '') lines.push('', `换算：${note}`)
  return lines.join('\n')
}

/**
 * Register the guard.
 * @param ctx - plugin context.
 * @param config - row configuration: `threshold` in tokens, optional `unitNote`.
 */
export function apply(ctx, config) {
  const raw = Number(config?.threshold)
  const threshold = Number.isFinite(raw) && raw > 0 ? raw : 100000
  const note = typeof config?.unitNote === 'string' ? config.unitNote.trim() : ''

  ctx.effect(() => ctx.on('tools/pre-execute', async (exec, next) => {
    const agent = exec.agent
    if (agent === undefined) return next()
    const call = lastCall(agent.session)
    if (call === undefined || call.total <= threshold) return next()

    const key = `${agent.session.id}:${call.seq}`
    if (ASKED.has(key)) return next()
    ASKED.add(key)
    if (ASKED.size > 200) ASKED.clear()

    let answers
    try {
      answers = await ctx.userQuestions.ask({
        questions: [{
          id: 'budget',
          header: 'Token 预算',
          question: budgetQuestion(call, threshold, note),
          options: [
            { label: CONTINUE, description: '放行这一次工具调用，继续当前工作。' },
            { label: STOP, description: '停止本轮，先给进度小结。' },
          ],
        }],
        agent,
        signal: exec.signal,
      })
    } catch {
      // No answer channel, or the wait was cancelled: never block ordinary work.
      return next()
    }

    const chosen = answers?.answers?.find((item) => item.id === 'budget')
    const picked = chosen?.selected ?? []
    if (picked.includes(STOP)) {
      return {
        kind: 'deny',
        reason: `用户选择停止：上一次模型调用用了 ${formatTokens(call.total)} token，超过单次上限 ${formatTokens(threshold)}。请立即停止新的工作，给出一份简短进度小结。`,
      }
    }
    return next()
  }))
}
