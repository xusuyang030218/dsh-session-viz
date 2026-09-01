/*
 * loopLayout 闭环轮环图几何单测。
 */
import { describe, expect, it } from 'vitest'
import type { FlowNode, FlowSession, SessionFlowSnapshot } from '../src/shared/flow.ts'
import { loopLayout } from '../src/client/model.ts'

function node(partial: Partial<FlowNode> & Pick<FlowNode, 'id' | 'time' | 'kind' | 'status'>): FlowNode {
  return { sessionId: 'root', seq: 0, title: partial.kind, ...partial }
}

function session(partial: Partial<FlowSession> & { id: string, nodes: FlowNode[] }): FlowSession {
  return {
    parentId: undefined, title: partial.id, createdAt: 0, seedLength: 0,
    sourceEventCount: partial.nodes.length, capturedThroughSeq: null, omittedEvents: 0, ...partial,
  }
}

function snapshot(sessions: FlowSession[], rootSessionId = 'root'): SessionFlowSnapshot {
  return { version: 1, capturedAt: 1000, rootSessionId, sessions, truncated: false }
}

describe('loopLayout', () => {
  it('根会话按轮次生成同心环，状态取节点集', () => {
    const flow = snapshot([
      session({
        id: 'root',
        nodes: [
          node({ id: 'a', time: 0, turn: 1, kind: 'input', status: 'completed' }),
          node({ id: 'b', time: 100, turn: 1, step: 1, kind: 'tool', status: 'completed' }),
          node({ id: 'c', time: 200, turn: 2, step: 1, kind: 'tool', status: 'error' }),
        ],
      }),
    ])
    const layout = loopLayout(flow)
    expect(layout.turns).toHaveLength(2)
    expect(layout.turns[0]!.turn).toBe(1)
    expect(layout.turns[0]!.status).toBe('completed')
    expect(layout.turns[0]!.radius).toBeLessThan(layout.turns[1]!.radius)
    expect(layout.turns[1]!.status).toBe('error')
    // 节点落点在环上（半径为环半径）
    const ringNode = layout.turns[0]!.nodes[0]!
    expect(Math.hypot(ringNode.x, ringNode.y)).toBeCloseTo(layout.turns[0]!.radius, 5)
  })

  it('进行中的最后节点 → 环状态 running（未闭合）', () => {
    const flow = snapshot([
      session({
        id: 'root',
        nodes: [
          node({ id: 'a', time: 0, turn: 1, kind: 'input', status: 'completed' }),
          node({ id: 'b', time: 100, turn: 1, step: 1, kind: 'tool', status: 'running' }),
        ],
      }),
    ])
    expect(loopLayout(flow).turns[0]!.status).toBe('running')
  })

  it('子 Agent 生成分叉环，且带 fork/merge 角度', () => {
    const flow = snapshot([
      session({
        id: 'root',
        createdAt: 0,
        nodes: [
          node({ id: 'a', time: 0, turn: 1, kind: 'input', status: 'completed' }),
          node({ id: 'b', time: 100, turn: 1, step: 1, kind: 'model', status: 'completed' }),
        ],
      }),
      session({
        id: 'child', createdAt: 50,
        nodes: [
          node({ id: 'c', time: 60, kind: 'tool', status: 'completed', sessionId: 'child' }),
          node({ id: 'd', time: 80, kind: 'tool', status: 'completed', sessionId: 'child' }),
        ],
      }),
    ])
    const layout = loopLayout(flow)
    expect(layout.branches).toHaveLength(1)
    const branch = layout.branches[0]!
    expect(branch.session.id).toBe('child')
    expect(typeof branch.forkAngle).toBe('number')
    expect(typeof branch.mergeAngle).toBe('number')
    expect(branch.nodes).toHaveLength(2)
  })

  it('空会话：返回空环布局且不崩溃', () => {
    const layout = loopLayout(snapshot([session({ id: 'root', nodes: [] })]))
    expect(layout.turns).toHaveLength(0)
    expect(layout.branches).toHaveLength(0)
    expect(layout.maxRadius).toBeGreaterThan(0)
  })
})
