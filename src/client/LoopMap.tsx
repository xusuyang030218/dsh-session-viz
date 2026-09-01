/*
 * 闭环轮环卡片 —— 会话执行图的 SVG 闭环渲染（v3）。
 *
 * 设计要点（参考 dsh-seelog 的语义标签卡风格）：
 *   - 每个轮次 = 一张独立卡片里的一个闭环，环上按时间把步骤切成弧段，
 *     事件节点以彩色圆点落在环上。
 *   - 关键节点（输入/模型/工具/错误）在环外带「中文语义标签卡」+ 引线，
 *     一眼能看出环上的哪一段对应哪个动作。
 *   - 子 Agent = 挂在父轮环右侧的迷你分叉环（分叉 → 执行 → 汇回）。
 *   - 闭合/进行中/失败由颜色、虚线与脉冲动画表达；悬停看语义、点击进检查器。
 *
 * 语义层（model.ts / semantic.ts）与数据流（SessionMapView.tsx）融合自
 * dsh-seelog（MIT License），完整许可见仓库根目录 LICENSE.dsh-seelog.MIT。
 */
import { useMemo, useRef, useState } from 'react'
import type { FlowNode, SessionFlowSnapshot } from '../shared/flow.ts'
import { durationLabel, loopLayout, type BranchLoop, type RingNode, type TurnRing } from './model.ts'
import { describeNode } from './semantic.ts'

interface Props {
  readonly snapshot: SessionFlowSnapshot
  readonly selectedId: string | null
  readonly onSelect: (node: FlowNode) => void
}

const KIND_COLOR: Record<FlowNode['kind'], string> = {
  input: '#62a9ff', model: '#b48cff', tool: '#3ecf9a', error: '#f0646b', turn: '#9aafd1',
}
const STATUS_COLOR: Record<FlowNode['status'], string> = {
  completed: '#3ecf9a', running: '#f5b83d', error: '#f0646b',
}
const STATUS_LABEL: Record<FlowNode['status'], string> = {
  completed: '闭合', running: '进行中', error: '失败',
}

/** 环上两点之间的弧线 path（angle 为弧度，0=正上方，顺时针）。 */
function arcPath(radius: number, angleFrom: number, angleTo: number, gap = 0.02): string {
  const a0 = angleFrom + gap
  const a1 = angleTo - gap
  if (a1 <= a0) return ''
  const x0 = radius * Math.cos(a0), y0 = radius * Math.sin(a0)
  const x1 = radius * Math.cos(a1), y1 = radius * Math.sin(a1)
  const large = (a1 - a0) > Math.PI ? 1 : 0
  return `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${radius} ${radius} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`
}

interface Tip {
  readonly x: number
  readonly y: number
  readonly node: FlowNode
}

function fmt(ms: number): string {
  if (ms < 1000) return `${String(ms)}ms`
  const s = ms / 1000
  return s < 60 ? `${s.toFixed(1)}s` : `${Math.floor(s / 60)}m${String(Math.round(s % 60)).padStart(2, '0')}s`
}

/** 一张轮次卡片：主环 + 中文标签卡 + 该轮子 Agent 分叉迷你环。 */
function TurnCard({
  ring,
  branches,
  selectedId,
  onSelect,
  onTip,
}: {
  readonly ring: TurnRing
  readonly branches: readonly BranchLoop[]
  readonly selectedId: string | null
  readonly onSelect: (node: FlowNode) => void
  readonly onTip: (tip: Tip | null) => void
}) {
  const R = ring.radius
  const mainCx = 150
  const branchBaseX = 420
  const branchGapY = 78
  const branchCount = branches.length
  const height = Math.max(270, 150 + branchCount * branchGapY)
  const mainCy = height / 2

  const running = ring.status === 'running'
  const bandRadius = R - 8

  // 需要出标签的节点：输入/模型/错误始终出；工具在数量少时出
  const toolCount = ring.nodes.filter((n) => n.node.kind === 'tool').length
  const labelCandidates = ring.nodes.filter((ringNode) => {
    const kind = ringNode.node.kind
    if (kind === 'input' || kind === 'model' || kind === 'error') return true
    return kind === 'tool' && toolCount <= 6
  })
  const labels = labelCandidates.slice(0, 12)

  const tipFor = (ringNode: RingNode, event: React.MouseEvent<SVGGraphicsElement>): void => {
    const box = event.currentTarget.ownerSVGElement?.getBoundingClientRect()
    if (box === undefined) return
    onTip({ x: event.clientX - box.left + 16, y: event.clientY - box.top + 16, node: ringNode.node })
  }

  const nodeDot = (ringNode: RingNode, cx: number, cy: number, key: string): React.ReactElement => {
    const node = ringNode.node
    const selected = node.id === selectedId
    return (
      <circle
        key={key}
        cx={cx + ringNode.x}
        cy={cy + ringNode.y}
        r={selected ? 6.5 : 4.5}
        fill={KIND_COLOR[node.kind]}
        stroke={selected ? '#ffffff' : 'rgba(14,25,35,0.9)'}
        strokeWidth={selected ? 1.8 : 1}
        className={node.status === 'running' ? 'seelogRunning' : undefined}
        style={{ cursor: 'pointer' }}
        onClick={(event) => { event.stopPropagation(); onSelect(node) }}
        onMouseEnter={(event) => tipFor(ringNode, event)}
        onMouseMove={(event) => tipFor(ringNode, event)}
        onMouseLeave={() => onTip(null)}
      />
    )
  }

  return (
    <section className="seelogTurnCard">
      <header className="seelogTurnHead">
        <span className="seelogTurnTitle">第 {String(ring.turn)} 轮</span>
        <span className="seelogTurnChip" style={{ color: STATUS_COLOR[ring.status], borderColor: STATUS_COLOR[ring.status] }}>
          {STATUS_LABEL[ring.status]}
        </span>
        <span className="seelogTurnMeta">{String(ring.steps.length)} 步</span>
        {ring.durationMs !== undefined && <span className="seelogTurnMeta">{fmt(ring.durationMs)}</span>}
      </header>
      <div className="seelogTurnBody">
        <svg
          className="seelogTurnSvg"
          viewBox={`0 0 ${branchBaseX + 130} ${height}`}
          role="img"
          aria-label={`第 ${String(ring.turn)} 轮闭环`}
        >
          {/* 主环轨道 */}
          <circle cx={mainCx} cy={mainCy} r={R} fill="rgba(255,255,255,0.02)" stroke="rgba(120,150,190,0.15)" strokeWidth={1} />
          {/* 步骤弧段带 */}
          {ring.steps.map((step, index) => (
            <path
              key={`arc-${index}`}
              d={arcPath(bandRadius, step.angleFrom, step.angleTo)}
              fill="none"
              stroke={STATUS_COLOR[step.status]}
              strokeWidth={11}
              opacity={0.85}
              className={step.status === 'running' ? 'seelogRunning' : undefined}
            />
          ))}
          {/* 状态环 */}
          <circle
            cx={mainCx}
            cy={mainCy}
            r={R}
            fill="none"
            stroke={STATUS_COLOR[ring.status]}
            strokeWidth={2.6}
            strokeDasharray={running ? '5 4' : undefined}
            className={running ? 'seelogRunning' : undefined}
          />
          {/* 中心：轮次摘要 */}
          <text x={mainCx} y={mainCy - 6} textAnchor="middle" fontSize={14} fontWeight={800} fill="#e4eef8">
            第 {String(ring.turn)} 轮
          </text>
          <text x={mainCx} y={mainCy + 12} textAnchor="middle" fontSize={10} fill="#91a7bc">
            {String(ring.nodes.length)} 事件
          </text>
          {/* 中文标签卡 + 引线 */}
          {labels.map((ringNode) => {
            const node = ringNode.node
            const ang = ringNode.angle
            const dotX = mainCx + R * Math.cos(ang)
            const dotY = mainCy + R * Math.sin(ang)
            const labelRadius = R + 36
            const lx = mainCx + labelRadius * Math.cos(ang)
            const ly = mainCy + labelRadius * Math.sin(ang)
            const anchor = Math.cos(ang) >= 0 ? 'start' : 'end'
            const text = describeNode(node).title
            const boxWidth = Math.min(152, text.length * 11 + 18)
            const boxX = anchor === 'start' ? lx + 4 : lx - 4 - boxWidth
            return (
              <g key={`label-${node.id}`} className="seelogRingLabel">
                <line x1={dotX} y1={dotY} x2={lx} y2={ly} stroke={KIND_COLOR[node.kind]} strokeWidth={1.1} opacity={0.7} />
                <rect x={boxX} y={ly - 11} width={boxWidth} height={20} rx={5} fill="#0d1823" stroke={KIND_COLOR[node.kind]} strokeWidth={1.1} />
                <text
                  x={anchor === 'start' ? boxX + 8 : boxX + boxWidth - 8}
                  y={ly + 3.5}
                  textAnchor={anchor}
                  fontSize={10}
                  fontWeight={600}
                  fill="#eaf5ff"
                  style={{ cursor: 'pointer' }}
                  onClick={(event) => { event.stopPropagation(); onSelect(node) }}
                  onMouseEnter={(event) => {
                    const box = event.currentTarget.ownerSVGElement?.getBoundingClientRect()
                    if (box !== undefined) onTip({ x: event.clientX - box.left + 16, y: event.clientY - box.top + 16, node })
                  }}
                  onMouseLeave={() => onTip(null)}
                >
                  {text.length > 9 ? `${text.slice(0, 9)}…` : text}
                </text>
              </g>
            )
          })}
          {/* 节点圆点 */}
          {ring.nodes.map((ringNode, index) => nodeDot(ringNode, mainCx, mainCy, `n-${index}`))}
          {/* 子 Agent 分叉迷你环 */}
          {branches.map((branch, index) => {
            const by = mainCy + (index - (branchCount - 1) / 2) * branchGapY
            const bR = branch.radius
            const bRunning = branch.status === 'running'
            return (
              <g key={`branch-${index}`}>
                {/* 分叉连接线：主环边缘 → 迷你环边缘 */}
                <line
                  x1={mainCx + R * Math.cos(branch.forkAngle)}
                  y1={mainCy + R * Math.sin(branch.forkAngle)}
                  x2={branchBaseX - bR * Math.cos(branch.forkAngle)}
                  y2={by - bR * Math.sin(branch.forkAngle)}
                  stroke="#43d4d2" strokeWidth={1.3} opacity={0.5}
                />
                {/* 汇回连接线：迷你环边缘 → 主环边缘 */}
                <line
                  x1={branchBaseX - bR * Math.cos(branch.mergeAngle)}
                  y1={by - bR * Math.sin(branch.mergeAngle)}
                  x2={mainCx + R * Math.cos(branch.mergeAngle)}
                  y2={mainCy + R * Math.sin(branch.mergeAngle)}
                  stroke="#43d4d2" strokeWidth={1.3} opacity={0.5}
                />
                <circle
                  cx={branchBaseX}
                  cy={by}
                  r={bR}
                  fill="rgba(67,212,210,0.06)"
                  stroke="#43d4d2"
                  strokeWidth={2}
                  strokeDasharray={bRunning ? '4 3' : undefined}
                  className={bRunning ? 'seelogRunning' : undefined}
                />
                {branch.nodes.map((ringNode, nodeIndex) => nodeDot(ringNode, branchBaseX, by, `b-${index}-${nodeIndex}`))}
                <text
                  x={branchBaseX}
                  y={by + bR + 15}
                  textAnchor="middle"
                  fontSize={9.5}
                  fontWeight={600}
                  fill="#43d4d2"
                >
                  {branch.session.title.length > 12 ? `${branch.session.title.slice(0, 12)}…` : branch.session.title}
                </text>
              </g>
            )
          })}
        </svg>
      </div>
    </section>
  )
}

/** 会话执行环图：轮次闭环卡片流（v3，seelog 风格标签）。 */
export function LoopMap({ snapshot, selectedId, onSelect }: Props) {
  const layout = useMemo(() => loopLayout(snapshot), [snapshot])
  const [tip, setTip] = useState<Tip | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)

  const branchesByTurn = useMemo(() => {
    const map = new Map<number, BranchLoop[]>()
    for (const branch of layout.branches) {
      const list = map.get(branch.parentTurn) ?? []
      map.set(branch.parentTurn, [...list, branch])
    }
    return map
  }, [layout])

  return (
    <div className="seelogRingWrap" ref={wrapRef}>
      <div className="seelogTurnStack">
        {layout.turns.map((ring) => (
          <TurnCard
            key={`turn-${ring.turn}`}
            ring={ring}
            branches={branchesByTurn.get(ring.turn) ?? []}
            selectedId={selectedId}
            onSelect={onSelect}
            onTip={(value) => {
              if (value === null) { setTip(null); return }
              const box = wrapRef.current?.getBoundingClientRect()
              if (box === undefined) return
              setTip({ x: value.x, y: value.y, node: value.node })
            }}
          />
        ))}
      </div>
      {tip !== null && (
        <div className="seelogRingTip" style={{ left: tip.x, top: tip.y }}>
          <b>{describeNode(tip.node).title}</b>
          <span>{describeNode(tip.node).summary}</span>
          <br />
          <span>
            {STATUS_LABEL[tip.node.status]}
            {tip.node.turn !== undefined ? ` · 第 ${String(tip.node.turn)} 轮` : ''}
            {tip.node.step !== undefined ? ` · 第 ${String(tip.node.step)} 步` : ''}
            {durationLabel(tip.node) !== undefined ? ` · ${durationLabel(tip.node)}` : ''}
          </span>
        </div>
      )}
    </div>
  )
}
