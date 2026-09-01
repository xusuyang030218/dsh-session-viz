/*
 * dsh-rewind 回退语义单测：
 *  - parser.detectRewinds：标记识别、撤回区间、幽灵步骤框架、多次回退
 *  - parser.parseLogText：事件标注（withdrawn / rewind）与会话级统计
 *  - narrative：闭环 / 事件树 / 摘要 / 故事线 四视图对回退的处理
 */
import { describe, expect, it } from 'vitest'
import { detectRewinds, parseLogText, summarize } from '../src/host/parser.ts'
import { buildClosure, buildTree, buildSummary, buildStory, rewindOptsOf } from '../src/host/narrative.ts'

// ---------------------------------------------------------------------------
// 构造一个「发生了一次回退」的会话事件流
// ---------------------------------------------------------------------------

interface E { type: string; data: Record<string, unknown>; seq: number; time: number; [k: string]: unknown }

let n = 0
function ev(type: string, data: Record<string, unknown> = {}, extra: Record<string, unknown> = {}): E {
  const seq = n++
  return { type, data, seq, time: 1000 + seq * 100, ...extra }
}

function userMessage(text: string): E {
  return ev('user/message', { content: [{ type: 'text', text }] })
}

function buildRewoundSession(): E[] {
  n = 0
  const objs: E[] = [
    // 第 1 轮：正常
    ev('turn/start', { turn: 1 }),
    userMessage('第一轮提问'),
    ev('step/start', { turn: 1, step: 1 }),
    ev('tool/call', { name: 'read', callId: 'c1', arguments: '{"file_path":"a.txt"}' }),
    ev('tool/result', { message: { source: { callId: 'c1' } }, meta: { path: 'a.txt' } }),
    ev('assistant/message', { turn: 1, step: 1, message: { content: [{ type: 'text', text: '第一轮回答' }] }, usage: { inputTokens: 10, outputTokens: 5 } }),
    ev('step/end', { turn: 1, step: 1 }),
    ev('turn/end', { turn: 1, reason: { kind: 'success' } }),
    // 第 2 轮：将被回退（目标 = seq 9 的用户消息）
    ev('turn/start', { turn: 2 }),
    userMessage('继续，做 B 方案'),
    ev('step/start', { turn: 2, step: 1 }),
    ev('tool/call', { name: 'write', callId: 'c2', arguments: '{"file_path":"b.txt","content":"B"}' }),
    ev('tool/result', { message: { source: { callId: 'c2' } }, meta: { path: 'b.txt' } }),
    ev('assistant/message', { turn: 2, step: 1, message: { content: [{ type: 'text', text: 'B 方案完成' }] }, usage: { inputTokens: 8, outputTokens: 4 } }),
    ev('step/end', { turn: 2, step: 1 }),
    ev('turn/end', { turn: 2, reason: { kind: 'success' } }),
    // 回退标记：幽灵步骤框架 + 空消息标记（dsh-rewind 的持久化形态）
    ev('step/start', { turn: 2, step: 2 }),
    ev('assistant/message',
      { turn: 2, step: 2, message: { content: [], source: { provider: 'dsh-rewind', model: 'rewind-marker' } } },
      { surfaceOp: { op: 'replace', start: 9, end: 13 }, sourceEventSeqs: [9, 10, 11, 12, 13] }),
    ev('step/end', { turn: 2, step: 2 }),
    // 第 3 轮：回退后重做（有效执行）
    ev('turn/start', { turn: 3 }),
    userMessage('重新来，做 C 方案'),
    ev('step/start', { turn: 3, step: 1 }),
    ev('tool/call', { name: 'write', callId: 'c3', arguments: '{"file_path":"c.txt","content":"C"}' }),
    ev('tool/result', { message: { source: { callId: 'c3' } }, meta: { path: 'c.txt' } }),
    ev('assistant/message', { turn: 3, step: 1, message: { content: [{ type: 'text', text: 'C 方案完成' }] }, usage: { inputTokens: 9, outputTokens: 6 } }),
    ev('step/end', { turn: 3, step: 1 }),
    ev('turn/end', { turn: 3, reason: { kind: 'success' } }),
  ]
  return objs
}

describe('detectRewinds', () => {
  it('识别标记：目标 seq、幽灵步骤框架、撤回区间 [target, marker)', () => {
    const info = detectRewinds(buildRewoundSession())
    expect(info.markers).toHaveLength(1)
    const m = info.markers[0]!
    expect(m.markerSeq).toBe(17)
    expect(m.targetSeq).toBe(9)
    expect(m.ghostStartSeq).toBe(16)
    expect(m.ghostEndSeq).toBe(18)
    expect(m.sourceEventSeqs).toEqual([9, 10, 11, 12, 13])
    // 撤回区间 = [9, 17) 的全部事件（含非 surface 的 step/turn 事件）
    expect(m.withdrawnCount).toBe(8)
    expect([...info.withdrawnSeqs].sort((a, b) => a - b)).toEqual([9, 10, 11, 12, 13, 14, 15, 16])
    // 幽灵框架与标记本身属于 noise
    expect(info.noiseSeqs.has(16)).toBe(true)
    expect(info.noiseSeqs.has(17)).toBe(true)
    expect(info.noiseSeqs.has(18)).toBe(true)
    expect(info.markerSeqs.has(17)).toBe(true)
  })

  it('普通 harness surfaceOp（字符串 append）不是回退标记', () => {
    const objs = [
      ev('assistant/message', { turn: 1, step: 1, message: { content: [{ type: 'text', text: '正常回复' }] } }, { surfaceOp: 'append', sourceEventSeqs: [1, 2, 3] }),
    ]
    expect(detectRewinds(objs).markers).toHaveLength(0)
  })

  it('多次回退：撤回区间互不重叠，各自独立', () => {
    n = 0
    const objs: E[] = [
      ev('turn/start', { turn: 1 }),
      userMessage('A'),
      ev('assistant/message', { turn: 1, step: 1, message: { content: [{ type: 'text', text: 'a1' }] } }),
      // 第一次回退：目标 = seq 1
      ev('step/start', { turn: 1, step: 9 }),
      ev('assistant/message', { turn: 1, step: 9, message: { content: [], source: { provider: 'dsh-rewind', model: 'rewind-marker' } } }, { surfaceOp: { op: 'replace', start: 1, end: 2 }, sourceEventSeqs: [1, 2] }),
      ev('step/end', { turn: 1, step: 9 }),
      userMessage('B'),
      ev('assistant/message', { turn: 1, step: 1, message: { content: [{ type: 'text', text: 'b1' }] } }),
      // 第二次回退：目标 = seq 5
      ev('step/start', { turn: 1, step: 10 }),
      ev('assistant/message', { turn: 1, step: 10, message: { content: [], source: { provider: 'dsh-rewind', model: 'rewind-marker' } } }, { surfaceOp: { op: 'replace', start: 5, end: 6 }, sourceEventSeqs: [5, 6] }),
      ev('step/end', { turn: 1, step: 10 }),
    ]
    const info = detectRewinds(objs)
    expect(info.markers).toHaveLength(2)
    expect(info.markers[0]!.targetSeq).toBe(1)
    expect(info.markers[1]!.targetSeq).toBe(5)
    // 两个撤回区间互不重叠；各区间含目标起、标记止之间的全部事件（含幽灵框架事件）
    expect([...info.withdrawnSeqs].sort((a, b) => a - b)).toEqual([1, 2, 3, 5, 6, 7, 8])
    // 标记事件本身属于 noise（不在撤回集合内）
    expect(info.withdrawnSeqs.has(4)).toBe(false)
    expect(info.noiseSeqs.has(4)).toBe(true)
  })
})

describe('parseLogText 回退标注', () => {
  it('事件标注 withdrawn/rewind 与会话级统计', () => {
    const text = buildRewoundSession().map((o) => JSON.stringify(o)).join('\n')
    const parsed = parseLogText(text)
    expect(parsed.meta.rewindCount).toBe(1)
    expect(parsed.meta.withdrawnCount).toBe(8)
    expect(parsed.rewinds).toHaveLength(1)
    const bySeq = new Map(parsed.events.map((e) => [e.seq, e]))
    // 撤回区间内的事件
    for (const seq of [9, 10, 11, 12, 13, 14, 15, 16]) expect(bySeq.get(seq)?.withdrawn).toBe(true)
    // 幽灵框架与标记
    for (const seq of [16, 17, 18]) expect(bySeq.get(seq)?.rewind).toBe(true)
    // 有效事件不受影响
    expect(bySeq.get(0)?.withdrawn).toBeUndefined()
    expect(bySeq.get(24)?.withdrawn).toBeUndefined()
    // 标记摘要可读（空消息不应误读为普通回复）
    expect(summarize(JSON.parse(text.split('\n')[17]!) as Record<string, unknown>)).toContain('(no text)')
  })
})

describe('narrative 视图回退语义', () => {
  const objs = buildRewoundSession()
  const rw = rewindOptsOf(objs)

  it('buildClosure：被回退的轮次整体剔除，不产生未闭合环', () => {
    const model = buildClosure(objs, rw)
    expect(model.rings.map((r) => r.turn)).toEqual([1, 3])
    expect(model.rewindCount).toBe(1)
    expect(model.withdrawnCount).toBe(8)
    expect(model.summary.turn.total).toBe(2)
    expect(model.summary.unclosed).toHaveLength(0)
  })

  it('buildTree：撤回事件降权保留、幽灵框架不产生空步骤、轮次级统计正确', () => {
    const tree = buildTree([], objs, rw)
    expect(tree.map((t) => t.turn)).toEqual([1, 2, 3])
    const turn2 = tree.find((t) => t.turn === 2)!
    expect(turn2.rewindCount).toBe(1)
    expect(turn2.withdrawnCount).toBe(4) // user 9 + tool/call 11 + tool/result 12 + assistant 13
    expect(turn2.steps).toHaveLength(1) // 幽灵 step/start(16) 未产生第 2 步
    expect(turn2.steps[0]!.withdrawnCount).toBe(3)
    // 全部被撤回的事件带 withdrawn 标记
    const withdrawnEvents = tree
      .flatMap((t) => t.steps.flatMap((s) => s.groups))
      .filter((g) => g.kind === 'event')
      .flatMap((g) => g.events ?? [])
      .filter((e) => e.withdrawn)
    expect(withdrawnEvents.map((e) => e.seq).sort((a, b) => (a ?? 0) - (b ?? 0))).toEqual([11, 12, 13])
    expect(tree.find((t) => t.turn === 3)!.withdrawnCount).toBeUndefined()
  })

  it('buildSummary：统计只计有效执行，回退详情与撤回文件单列', () => {
    const summary = buildSummary([], objs, { title: '测试会话' }, null, rw)
    expect(summary.turnCount).toBe(2)
    expect(summary.stepCount).toBe(2)
    expect(summary.tokens).toEqual({ inputTokens: 19, outputTokens: 11, cacheReadTokens: 0, reasoningTokens: 0 })
    expect(summary.toolStats).toEqual({
      read: { icon: '📖', verb: '读取了', count: 1 },
      write: { icon: '✏️', verb: '写入了', count: 1 },
    })
    expect(summary.files.map((f) => f.path)).toEqual(['c.txt'])
    expect(summary.rewoundFiles.map((f) => f.path)).toEqual(['b.txt'])
    expect(summary.rewoundFiles[0]!.withdrawn).toBe(true)
    expect(summary.rewinds).toHaveLength(1)
    expect(summary.rewinds[0]!.targetPreview).toBe('继续，做 B 方案')
    expect(summary.rewinds[0]!.withdrawnCount).toBe(8)
    expect(summary.rewindCount).toBe(1)
    expect(summary.withdrawnCount).toBe(8)
  })

  it('buildStory：插入「↶ 回退」边界节点，撤回节点降权', () => {
    const story = buildStory([], objs, rw)
    expect(story.map((t) => t.turn)).toEqual([1, 2, 3])
    const turn2 = story.find((t) => t.turn === 2)!
    const rewindNode = turn2.nodes.find((nd) => nd.kind === 'rewind')
    expect(rewindNode).toBeDefined()
    expect(rewindNode!.human).toContain('撤回 8 条事件')
    expect(rewindNode!.text).toBe('继续，做 B 方案')
    const withdrawn = turn2.nodes.filter((nd) => nd.withdrawn)
    expect(withdrawn).toHaveLength(3)
    expect(withdrawn.some((nd) => nd.kind === 'user' && nd.human.includes('已回退'))).toBe(true)
    // 回退节点位于该轮末尾（撤回内容之后）
    expect(turn2.nodes[turn2.nodes.length - 1]!.kind).toBe('rewind')
    // 有效轮次不掺入撤回节点
    expect(story.find((t) => t.turn === 3)!.nodes.every((nd) => !nd.withdrawn)).toBe(true)
  })
})
