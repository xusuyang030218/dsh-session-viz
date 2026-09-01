/*
 * 闭环轮环图（Loop Ring Map）——会话执行图的 SVG 闭环渲染。
 *
 * 取代原 Three.js 横向条状执行线：根会话的每个轮次画成一个同心圆环（T1 在内、
 * 越靠外越晚），环上按时间把步骤切成弧段，事件节点落在环上；子 Agent 画成从
 * 分叉角度伸出的小环（分叉 → 执行 → 汇回），整个会话呈现为「一环扣一环」的
 * 闭环形态。
 *
 * 语义层（model.ts / semantic.ts）与数据流（SessionMapView.tsx）融合自
 * dsh-seelog（MIT License），完整许可见仓库根目录 LICENSE.dsh-seelog.MIT。
 */
import { useMemo, useRef, useState } from 'react'
import type { FlowNode, SessionFlowSnapshot } from '../shared/flow.ts'
import { durationLabel, loopLayout, type RingNode } from './model.ts'
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
function arcPath(radius: number, angleFrom: number, angleTo: number, gap = 0.015): string {
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

export function LoopMap({ snapshot, selectedId, onSelect }: Props) {
  const layout = useMemo(() => loopLayout(snapshot), [snapshot])
  const [tip, setTip] = useState<Tip | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)

  const pad = 54
  const max = layout.maxRadius + pad
  const size = max * 2

  const showTip = (node: FlowNode, event: React.MouseEvent): void => {
    const box = wrapRef.current?.getBoundingClientRect()
    if (box === undefined) return
    setTip({ x: event.clientX - box.left + 14, y: event.clientY - box.top + 14, node })
  }
  const hideTip = (): void => setTip(null)

  // 环上节点圆点
  const nodeDot = (ringNode: RingNode, radius: number, key: string): React.ReactElement => {
    const node = ringNode.node
    const selected = node.id === selectedId
    return (
      <circle
        key={key}
        cx={ringNode.x}
        cy={ringNode.y}
        r={selected ? 6 : 4.2}
        fill={KIND_COLOR[node.kind]}
        stroke={selected ? '#ffffff' : 'rgba(16,25,35,0.9)'}
        strokeWidth={selected ? 1.6 : 1}
        className={node.status === 'running' ? 'seelogRunning' : undefined}
        style={{ cursor: 'pointer' }}
        onClick={(event) => { event.stopPropagation(); onSelect(node) }}
        onMouseEnter={(event) => showTip(node, event)}
        onMouseMove={(event) => showTip(node, event)}
        onMouseLeave={hideTip}
      />
    )
  }

  return (
    <div className="seelogRingWrap" ref={wrapRef}>
      <svg
        className="seelogRing"
        viewBox={`${-max} ${-max} ${size} ${size}`}
        role="img"
        aria-label="会话执行闭环图"
      >
        {/* 背景网格圆 */}
        {layout.turns.map((ring) => (
          <circle key={`track-${ring.turn}`} r={ring.radius} fill="rgba(255,255,255,0.02)" stroke="rgba(120,150,190,0.14)" strokeWidth={1} />
        ))}

        {/* 每个轮次：步骤弧段带 + 状态环 + 节点 */}
        {layout.turns.map((ring) => {
          const bandRadius = ring.radius - 7
          const running = ring.status === 'running'
          return (
            <g key={`ring-${ring.turn}`}>
              {/* 步骤弧段带 */}
              {ring.steps.map((step, index) => (
                <path
                  key={`arc-${ring.turn}-${index}`}
                  d={arcPath(bandRadius, step.angleFrom, step.angleTo)}
                  fill="none"
                  stroke={STATUS_COLOR[step.status]}
                  strokeWidth={10}
                  strokeLinecap="butt"
                  opacity={0.85}
                  className={step.status === 'running' ? 'seelogRunning' : undefined}
                />
              ))}
              {/* 状态环 */}
              <circle
                r={ring.radius}
                fill="none"
                stroke={STATUS_COLOR[ring.status]}
                strokeWidth={2.6}
                strokeDasharray={running ? '5 4' : undefined}
                strokeLinecap="round"
                className={running ? 'seelogRunning' : undefined}
                opacity={0.95}
              />
              {/* 轮次标签 */}
              <text
                x={ring.radius * Math.cos(-Math.PI / 2)}
                y={ring.radius * Math.sin(-Math.PI / 2) - 10}
                textAnchor="middle"
                fontSize={10.5}
                fontWeight={700}
                fill="#a8bbcd"
              >
                T{ring.turn}
              </text>
              {/* 节点落点 */}
              {ring.nodes.map((ringNode, index) => nodeDot(ringNode, ring.radius, `n-${ring.turn}-${index}`))}
            </g>
          )
        })}

        {/* 子 Agent 分叉环 */}
        {layout.branches.map((branch, index) => {
          const running = branch.status === 'running'
          // 主环分叉点（forkRadius 所在环的边缘）
          const forkX = branch.forkRadius * Math.cos(branch.forkAngle)
          const forkY = branch.forkRadius * Math.sin(branch.forkAngle)
          const mergeX = branch.forkRadius * Math.cos(branch.mergeAngle)
          const mergeY = branch.forkRadius * Math.sin(branch.mergeAngle)
          // 分叉环上最靠近主环分叉/汇回方向的两个点
          const branchForkX = branch.cx - branch.radius * Math.cos(branch.forkAngle)
          const branchForkY = branch.cy - branch.radius * Math.sin(branch.forkAngle)
          const branchMergeX = branch.cx - branch.radius * Math.cos(branch.mergeAngle)
          const branchMergeY = branch.cy - branch.radius * Math.sin(branch.mergeAngle)
          return (
            <g key={`branch-${index}`}>
              {/* 分叉连接线：主环 → 分叉环 */}
              <line x1={forkX} y1={forkY} x2={branchForkX} y2={branchForkY} stroke="#43d4d2" strokeWidth={1.4} opacity={0.5} />
              {/* 汇回连接线：分叉环 → 主环 */}
              <line x1={branchMergeX} y1={branchMergeY} x2={mergeX} y2={mergeY} stroke="#43d4d2" strokeWidth={1.4} opacity={0.5} />
              <circle
                cx={branch.cx}
                cy={branch.cy}
                r={branch.radius}
                fill="rgba(67,212,210,0.05)"
                stroke="#43d4d2"
                strokeWidth={2.2}
                strokeDasharray={running ? '4 3' : undefined}
                className={running ? 'seelogRunning' : undefined}
              />
              {branch.nodes.map((ringNode, nodeIndex) => nodeDot(ringNode, branch.radius, `b-${index}-${nodeIndex}`))}
              <text
                x={branch.cx}
                y={branch.cy + branch.radius + 14}
                textAnchor="middle"
                fontSize={9.5}
                fontWeight={600}
                fill="#43d4d2"
              >
                子 Agent {index + 1}
              </text>
            </g>
          )
        })}

        {/* 中心：会话概览 */}
        <circle r={46} fill="#0e1d2d" stroke="#29465f" strokeWidth={1.5} />
        <text textAnchor="middle" y={-8} fontSize={13} fontWeight={800} fill="#e4eef8">
          {snapshot.rootSessionId.slice(0, 10)}
        </text>
        <text textAnchor="middle" y={8} fontSize={10.5} fill="#91a7bc">
          {String(snapshot.sessions.reduce((total, session) => total + session.nodes.length, 0))} 节点
        </text>
        <text textAnchor="middle" y={22} fontSize={9.5} fill="#91a7bc">
          {String(layout.turns.length)} 轮 · {String(layout.branches.length)} 子 Agent
        </text>
      </svg>

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
