/*
 * buildClosure 闭环模型单测：验证四类环的开始-结束配对与闭合状态。
 */
import { describe, expect, it } from 'vitest'
import { buildClosure } from '../src/host/narrative.ts'

function ev(type: string, data: Record<string, unknown> = {}, time = 1000, seq = 0): Record<string, unknown> {
  return { type, data, time, seq }
}

describe('buildClosure', () => {
  it('完整会话：turn/step/tool/approval 全部闭合', () => {
    const objs = [
      ev('turn/start', { turn: 1 }),
      ev('step/start', { turn: 1, step: 1 }),
      ev('tool/call', { name: 'read', callId: 'c1' }),
      ev('tool/result', { message: { source: { callId: 'c1' } } }),
      ev('step/end', { turn: 1, step: 1 }),
      ev('turn/end', { turn: 1, reason: { kind: 'success' } }),
    ]
    const model = buildClosure(objs)
    const s = model.summary
    expect(s.turn).toEqual({ total: 1, closed: 1, open: 0, error: 0 })
    expect(s.step).toEqual({ total: 1, closed: 1, open: 0, error: 0 })
    expect(s.tool).toEqual({ total: 1, closed: 1, open: 0, error: 0 })
    expect(s.approval).toEqual({ total: 0, closed: 0, open: 0, error: 0 })
    expect(s.unclosed).toHaveLength(0)
    // 嵌套：tool 在 step 内，step 在 turn 内
    const turn = model.rings[0]!
    expect(turn.kind).toBe('turn')
    expect(turn.children[0]?.kind).toBe('step')
    expect(turn.children[0]?.children[0]?.kind).toBe('tool')
  })

  it('进行中会话：未闭合的 tool 被标记为 open', () => {
    const objs = [
      ev('turn/start', { turn: 1 }),
      ev('step/start', { turn: 1, step: 1 }),
      ev('tool/call', { name: 'pwsh', callId: 'c9' }),
      // 没有 tool/result → 未闭合
    ]
    const model = buildClosure(objs)
    expect(model.summary.tool.total).toBe(1)
    expect(model.summary.tool.open).toBe(1)
    expect(model.summary.tool.closed).toBe(0)
    expect(model.summary.unclosed).toHaveLength(1)
    expect(model.summary.unclosed[0]?.label).toBe('PowerShell')
    expect(model.summary.unclosed[0]?.status).toBe('open')
  })

  it('失败环：tool error 与 turn error 记为 error', () => {
    const objs = [
      ev('turn/start', { turn: 1 }),
      ev('step/start', { turn: 1, step: 1 }),
      ev('tool/call', { name: 'read', callId: 'c2' }),
      ev('tool/result', { message: { source: { callId: 'c2' } }, error: { code: 'EPERM' } }),
      ev('step/end', { turn: 1, step: 1 }),
      ev('turn/end', { turn: 1, reason: { kind: 'error', error: { code: 'AGENT_ERROR' } } }),
    ]
    const model = buildClosure(objs)
    expect(model.summary.tool.error).toBe(1)
    expect(model.summary.turn.error).toBe(1)
    const turn = model.rings[0]!
    expect(turn.status).toBe('error')
    expect(turn.detail).toBe('AGENT_ERROR')
    const tool = turn.children[0]!.children[0]
    expect(tool?.status).toBe('error')
  })

  it('审批：asked 与 decided 配对，denied 记为 error', () => {
    const objs = [
      ev('approval/asked', { toolName: 'pwsh' }),
      ev('approval/decided', { outcome: 'denied' }),
    ]
    const model = buildClosure(objs)
    expect(model.summary.approval.total).toBe(1)
    expect(model.summary.approval.closed).toBe(0)
    expect(model.summary.approval.error).toBe(1)
    expect(model.summary.approval.open).toBe(0)
  })

  it('空输入：汇总全零', () => {
    const model = buildClosure([])
    expect(model.summary.turn.total).toBe(0)
    expect(model.rings).toHaveLength(0)
  })
})
