/*
 * 本文件融合自 dsh-seelog (https://github.com/lhwu1/dsh-seelog)
 * Copyright (c) dsh-seelog contributors — MIT License
 * 完整许可见仓库根目录 LICENSE.dsh-seelog.MIT
 */
import type { FlowNode, FlowSession, SessionFlowSnapshot } from '../shared/flow.ts'

/** One lightweight point used by the scene and the DOM execution ledger. */
export interface VisualNode {
  readonly node: FlowNode
  readonly x: number
  readonly y: number
  readonly lane: number
  /** Tool and failure records leave the root spine as local visual branches. */
  readonly isBranch: boolean
}

/** A session lane positioned beneath the root execution spine. */
export interface VisualLane {
  readonly session: FlowSession
  readonly lane: number
  readonly sceneY: number
  /** Horizontal point where this lane leaves its parent execution line. */
  readonly branchX: number
  /** Horizontal point where this lane has completed its own visible work. */
  readonly mergeX: number
  readonly nodes: readonly VisualNode[]
}

/** Layout data for a frozen session snapshot. */
export interface FlowLayout {
  readonly root: VisualLane
  readonly children: readonly VisualLane[]
  readonly width: number
  readonly height: number
}

const ROOT_Y = -120
const LANE_STEP = 86
const MAX_VISIBLE_NODES = 400
const MIN_TIME_GAP_PX = 132
const MAX_TIME_GAP_PX = 248

function orderedNodes(nodes: readonly FlowNode[]): readonly FlowNode[] {
  return [...nodes].sort((left, right) => left.time - right.time || left.seq - right.seq)
}

function visibleNodes(nodes: readonly FlowNode[]): readonly FlowNode[] {
  const ordered = orderedNodes(nodes)
  if (ordered.length <= MAX_VISIBLE_NODES) return ordered
  const keep = new Set<number>([0, ordered.length - 1])
  for (const [index, node] of ordered.entries()) {
    if (node.kind === 'error' || node.kind === 'input' || node.kind === 'model') keep.add(index)
  }
  const stride = Math.max(1, Math.ceil(ordered.length / MAX_VISIBLE_NODES))
  for (let index = 0; index < ordered.length; index += stride) keep.add(index)
  return [...keep].sort((left, right) => left - right).slice(0, MAX_VISIBLE_NODES).map(index => ordered[index]!).filter(Boolean)
}

function laneFor(
  session: FlowSession,
  lane: number,
  sceneY: number,
  positions: ReadonlyMap<number, number>,
): VisualLane {
  const nodes = visibleNodes(session.nodes).map((node, index) => ({
    node,
    x: positions.get(node.time) ?? 96,
    y: sceneY,
    lane,
    isBranch: false,
  }))
  const lastTime = nodes.at(-1)?.node.endTime ?? nodes.at(-1)?.node.time ?? session.createdAt
  return {
    session, lane, sceneY,
    branchX: positions.get(session.createdAt) ?? 48,
    mergeX: positions.get(lastTime) ?? positions.get(session.createdAt) ?? 48,
    nodes,
  }
}

/**
 * Assigns the root session to the execution spine and descendant sessions to
 * compact, non-overlapping parallel lanes.
 */
export function layoutSnapshot(snapshot: SessionFlowSnapshot): FlowLayout {
  const rootSession = snapshot.sessions.find(session => session.id === snapshot.rootSessionId)
    ?? snapshot.sessions[0]
  const sessions = snapshot.sessions
  const eventTimes = [...new Set(sessions.flatMap(session => [
    session.createdAt,
    ...visibleNodes(session.nodes).flatMap(node => node.endTime === undefined ? [node.time] : [node.time, node.endTime]),
  ]))].sort((left, right) => left - right)
  const positions = new Map<number, number>()
  let x = 96
  for (const [index, time] of eventTimes.entries()) {
    if (index > 0) {
      const prior = eventTimes[index - 1]!
      const deltaSeconds = Math.max(0, (time - prior) / 1_000)
      x += Math.min(MAX_TIME_GAP_PX, MIN_TIME_GAP_PX + Math.log1p(deltaSeconds) * 14)
    }
    positions.set(time, x)
  }
  const width = Math.max(720, x + 96)
  const root = laneFor(rootSession ?? {
    id: snapshot.rootSessionId,
    title: snapshot.rootSessionId.slice(0, 12),
    createdAt: snapshot.capturedAt,
    seedLength: 0,
    sourceEventCount: 0,
    capturedThroughSeq: null,
    omittedEvents: 0,
    nodes: [],
  }, 0, ROOT_Y, positions)
  const children = sessions
    .filter(session => session.id !== root.session.id)
    .sort((left, right) => left.createdAt - right.createdAt || left.id.localeCompare(right.id))
    .map((session, index) => {
      return laneFor(session, index + 1, 68 + index * LANE_STEP, positions)
    })
  return {
    root,
    children,
    width,
    height: Math.max(360, 184 + children.length * LANE_STEP),
  }
}

/** Human-facing label for a semantic event category. */
export function kindLabel(kind: FlowNode['kind']): string {
  switch (kind) {
    case 'input': return '输入'
    case 'model': return '模型'
    case 'tool': return '工具'
    case 'error': return '错误'
    case 'turn': return '轮次'
  }
}

/** Formats a duration without leaking raw event payloads. */
export function durationLabel(node: FlowNode): string | undefined {
  if (node.endTime === undefined) return undefined
  const milliseconds = Math.max(0, node.endTime - node.time)
  return milliseconds < 1_000 ? `${String(milliseconds)} ms` : `${(milliseconds / 1_000).toFixed(1)} s`
}

/** Counts the lightweight facts in a projection. */
export function eventCount(snapshot: SessionFlowSnapshot): number {
  return snapshot.sessions.reduce((total, session) => total + session.nodes.length, 0)
}

// ---------------------------------------------------------------------------
// 闭环轮环图（Loop Ring Map）几何
// ---------------------------------------------------------------------------

/** 环上的一个节点：angle 为弧度（0=正上方，顺时针），x/y 为环内坐标。 */
export interface RingNode {
  readonly node: FlowNode
  readonly angle: number
  readonly x: number
  readonly y: number
}

/** 一个步骤在环上占用的弧段。 */
export interface RingStep {
  readonly step: number
  readonly angleFrom: number
  readonly angleTo: number
  readonly status: FlowNode["status"]
  readonly nodes: readonly RingNode[]
}

/** 一个轮次的闭环（每轮一张卡片，半径固定）。 */
export interface TurnRing {
  readonly turn: number
  readonly radius: number
  readonly status: FlowNode["status"]
  readonly steps: readonly RingStep[]
  readonly nodes: readonly RingNode[]
  readonly startTime: number
  readonly endTime: number
  readonly durationMs?: number
}

/** 子 Agent 的分叉迷你环：挂在父轮环旁（本地坐标，组件负责定位）。 */
export interface BranchLoop {
  readonly session: FlowSession
  /** 父轮序号（分叉时间落在哪个轮）。 */
  readonly parentTurn: number
  readonly radius: number
  readonly forkAngle: number
  readonly mergeAngle: number
  readonly status: FlowNode["status"]
  readonly nodes: readonly RingNode[]
}

export interface LoopLayout {
  readonly turns: readonly TurnRing[]
  readonly branches: readonly BranchLoop[]
  readonly maxRadius: number
}

const LOOP_RING_RADIUS = 74
const LOOP_BRANCH_RADIUS = 34

function statusOfNodes(nodes: readonly FlowNode[]): FlowNode["status"] {
  if (nodes.some((node) => node.status === "error")) return "error"
  if (nodes.some((node) => node.status === "running")) return "running"
  return "completed"
}

/** 在节点集中找时间最近的节点，返回它的角度。 */
function nearestAngleOf(nodes: readonly RingNode[], time: number): number | undefined {
  if (nodes.length === 0) return undefined
  let best = nodes[0]!
  let bestDistance = Infinity
  for (const ringNode of nodes) {
    const distance = Math.abs(ringNode.node.time - time)
    if (distance < bestDistance) { bestDistance = distance; best = ringNode }
  }
  return best.angle
}

/**
 * 把会话快照布局为「闭环轮环卡片」：
 * 根会话的每个轮次 = 一张独立卡片里的一个闭环（半径固定），环上按时间把步骤切成
 * 弧段、节点落点在环上；子 Agent = 挂在父轮环旁的迷你分叉环（分叉→执行→汇回，
 * 组件负责定位）。闭合/进行中/失败由状态颜色、虚线与脉冲动画表达。
 */
export function loopLayout(snapshot: SessionFlowSnapshot): LoopLayout {
  const root = snapshot.sessions.find((session) => session.id === snapshot.rootSessionId) ?? snapshot.sessions[0]
  const rootNodes = orderedNodes(root?.nodes ?? [])
  const byTurn = new Map<number, FlowNode[]>()
  for (const node of rootNodes) {
    const turn = node.turn ?? 1
    const list = byTurn.get(turn) ?? []
    list.push(node)
    byTurn.set(turn, list)
  }
  const turns: TurnRing[] = []
  for (const turn of [...byTurn.keys()].sort((a, b) => a - b)) {
    const nodes = byTurn.get(turn)!
    const sorted = [...nodes].sort((a, b) => a.time - b.time || a.seq - b.seq)
    const first = sorted[0]!
    const last = sorted.at(-1)!
    const span = Math.max(1, last.time - first.time)
    const ringNodes: RingNode[] = sorted.map((node) => {
      const angle = -Math.PI / 2 + ((node.time - first.time) / span) * Math.PI * 2
      return { node, angle, x: LOOP_RING_RADIUS * Math.cos(angle), y: LOOP_RING_RADIUS * Math.sin(angle) }
    })
    // 按 step 分组为弧段（无 step 的事件各自成段）
    const steps: RingStep[] = []
    let current: RingNode[] = []
    let currentKey: number | string | undefined
    for (const ringNode of ringNodes) {
      const key = ringNode.node.step ?? `n${ringNode.node.seq}`
      if (currentKey !== undefined && key !== currentKey && current.length > 0) {
        steps.push({
          step: typeof currentKey === "number" ? currentKey : -1,
          angleFrom: current[0]!.angle,
          angleTo: current.at(-1)!.angle,
          status: statusOfNodes(current.map((c) => c.node)),
          nodes: current,
        })
        current = []
      }
      currentKey = key
      current.push(ringNode)
    }
    if (current.length > 0) {
      steps.push({
        step: typeof currentKey === "number" ? currentKey : -1,
        angleFrom: current[0]!.angle,
        angleTo: current.at(-1)!.angle,
        status: statusOfNodes(current.map((c) => c.node)),
        nodes: current,
      })
    }
    turns.push({
      turn,
      radius: LOOP_RING_RADIUS,
      status: statusOfNodes(nodes),
      steps,
      nodes: ringNodes,
      startTime: first.time,
      endTime: last.endTime ?? last.time,
      durationMs: last.endTime !== undefined ? Math.max(0, last.endTime - first.time) : undefined,
    })
  }

  // 子 Agent：挂在父轮环旁的分叉迷你环（本地坐标，组件负责定位）
  const branches: BranchLoop[] = []
  for (const session of snapshot.sessions) {
    if (session.id === root?.id) continue
    const nodes = orderedNodes(session.nodes)
    const last = nodes.at(-1)
    // 父轮：分叉时间落在哪个轮的时间范围内
    const forkTime = session.createdAt
    let parentTurn = turns[0]?.turn ?? 1
    for (const ring of turns) {
      if (ring.startTime <= forkTime && forkTime <= (ring.endTime ?? ring.startTime)) {
        parentTurn = ring.turn
        break
      }
    }
    const parentRing = turns.find((ring) => ring.turn === parentTurn)
    const forkAngle = parentRing !== undefined ? nearestAngleOf(parentRing.nodes, forkTime) ?? 0 : 0
    const mergeAngle = parentRing !== undefined
      ? nearestAngleOf(parentRing.nodes, last?.endTime ?? last?.time ?? forkTime) ?? forkAngle
      : forkAngle
    const firstNode = nodes[0]
    const startTime = firstNode?.time ?? forkTime
    const span = Math.max(1, (last?.time ?? forkTime) - startTime)
    const branchNodes: RingNode[] = nodes.map((node) => {
      const angle = -Math.PI / 2 + ((node.time - startTime) / span) * Math.PI * 2
      return { node, angle, x: LOOP_BRANCH_RADIUS * Math.cos(angle), y: LOOP_BRANCH_RADIUS * Math.sin(angle) }
    })
    branches.push({
      session,
      parentTurn,
      radius: LOOP_BRANCH_RADIUS,
      forkAngle,
      mergeAngle,
      status: statusOfNodes(nodes),
      nodes: branchNodes,
    })
  }

  return { turns, branches, maxRadius: LOOP_RING_RADIUS }
}
