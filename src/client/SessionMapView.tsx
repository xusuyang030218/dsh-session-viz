/*
 * 本文件融合自 dsh-seelog (https://github.com/lhwu1/dsh-seelog)
 * Copyright (c) dsh-seelog contributors — MIT License
 * 完整许可见仓库根目录 LICENSE.dsh-seelog.MIT
 *
 * 渲染层已从 Three.js 横向条状执行线替换为 SVG 闭环轮环图（LoopMap.tsx）。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { ConvViewProps } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { FlowNode, SessionFlowSnapshot } from '../shared/flow.ts'
import { LoopMap } from './LoopMap.tsx'
import { durationLabel, eventCount, kindLabel } from './model.ts'
import { describeNode, errorName, eventTypeName } from './semantic.ts'
import { ensureStyles } from './styles.ts'

interface EventLogDetail {
  readonly target: { readonly type: string, readonly seq: number, readonly time: number, readonly data: unknown }
  readonly context: readonly { readonly type: string, readonly seq: number, readonly time: number, readonly data: unknown }[]
}

function timeLabel(value: number): string {
  return new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(value)
}

function detailFor(node: FlowNode): readonly [string, string | undefined][] {
  return [
    ['类别', kindLabel(node.kind)], ['状态', node.status === 'error' ? '失败' : node.status === 'running' ? '执行中' : '完成'],
    ['时间', timeLabel(node.time)], ['耗时', durationLabel(node)], ['会话', node.sessionId.slice(0, 16)],
    ['日志位置', `seq ${String(node.seq)}`], ['轮次', node.turn === undefined ? undefined : String(node.turn)],
    ['步骤', node.step === undefined ? undefined : String(node.step)], ['结果', errorName(node.detail) ?? node.detail],
  ].filter((entry): entry is [string, string] => entry[1] !== undefined)
}

/** AgentTrace 内部的「会话图」：SVG 闭环轮环图 + 节点检查器。 */
export function SessionMapView({ sessionId }: ConvViewProps) {
  const [snapshot, setSnapshot] = useState<SessionFlowSnapshot | null>(null)
  const [selectedNode, setSelectedNode] = useState<FlowNode | null>(null)
  const [eventDetail, setEventDetail] = useState<EventLogDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const refreshSequence = useRef(0)
  useEffect(() => { ensureStyles() }, [])
  useEffect(() => {
    if (selectedNode === null) {
      setEventDetail(null)
      setDetailLoading(false)
      setDetailError(null)
      return
    }
    let cancelled = false
    setDetailLoading(true)
    setDetailError(null)
    void fetch(`/dsh-session-viz/api/map/event?sessionId=${encodeURIComponent(selectedNode.sessionId)}&seq=${String(selectedNode.seq)}`, { cache: 'no-store' })
      .then(async response => {
        if (!response.ok) throw new Error(`无法读取原始日志 (${String(response.status)})`)
        return await response.json() as EventLogDetail
      })
      .then(value => { if (!cancelled) setEventDetail(value) })
      .catch((reason: unknown) => { if (!cancelled) setDetailError(reason instanceof Error ? reason.message : String(reason)) })
      .finally(() => { if (!cancelled) setDetailLoading(false) })
    return () => { cancelled = true }
  }, [selectedNode])
  const refresh = useCallback(async (): Promise<void> => {
    const sequence = refreshSequence.current + 1
    refreshSequence.current = sequence
    setLoading(true)
    setError(null)
    try {
      const response = await fetch(`/dsh-session-viz/api/map/snapshot?sessionId=${encodeURIComponent(String(sessionId))}`, { cache: 'no-store' })
      if (!response.ok) throw new Error(`无法刷新会话图 (${String(response.status)})`)
      const nextSnapshot = await response.json() as SessionFlowSnapshot
      if (sequence !== refreshSequence.current) return
      setSnapshot(nextSnapshot)
    } catch (reason: unknown) {
      if (sequence === refreshSequence.current) setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      if (sequence === refreshSequence.current) setLoading(false)
    }
  }, [sessionId])
  useEffect(() => {
    setSnapshot(null)
    setSelectedNode(null)
    setEventDetail(null)
    setError(null)
  }, [sessionId])
  useEffect(() => {
    void refresh()
  }, [refresh])
  const selectNode = useCallback((node: FlowNode): void => { setSelectedNode(node) }, [])
  const displayedCount = snapshot === null ? 0 : eventCount(snapshot)
  return <main className="seelogRoot">
    <header className="seelogHeader">
      <div>
        <p className="seelogEyebrow">会话地图 · 闭环视图</p>
        <h1>会话执行环图</h1>
        <p className="seelogMeta">每个轮次是一个闭合的环，子 Agent 是分叉出去再汇回的小环；进行中的工作显示为琥珀色脉冲虚线。进入视图时读取一次日志，可手动刷新。</p>
      </div>
      <div className="seelogActions">
        <button className="seelogPrimary" onClick={() => void refresh()} disabled={loading}>
          {loading ? '刷新中…' : '⟳ 刷新会话图'}
        </button>
      </div>
    </header>
    {snapshot !== null && <section className="seelogStats" aria-label="会话图概览">
      <div><b>{String(snapshot.sessions.reduce((total, session) => total + (session.sourceEventCount ?? session.nodes.length), 0))}</b><span>原始日志事件</span></div>
      <div><b>{String(displayedCount)}</b><span>语义节点</span></div>
      <div><b>{String(snapshot.sessions.length)}</b><span>会话与子 Agent</span></div>
      <div><b>{timeLabel(snapshot.capturedAt)}</b><span>刷新时间</span></div>
    </section>}
    <section className="seelogRingLegend" aria-label="图例">
      <span><i style={{ background: '#3ecf9a' }} />闭合</span>
      <span><i style={{ background: '#f5b83d' }} />进行中</span>
      <span><i style={{ background: '#f0646b' }} />失败</span>
      <span className="sep" />
      <span><i style={{ background: '#62a9ff' }} />输入</span>
      <span><i style={{ background: '#b48cff' }} />模型</span>
      <span><i style={{ background: '#3ecf9a' }} />工具</span>
      <span><i style={{ background: '#43d4d2' }} />子 Agent 环</span>
    </section>
    {error !== null && <p className="seelogError">{error}</p>}
    {snapshot === null && <p className="seelogEmpty">{loading ? '正在读取当前会话图...' : '暂无可显示的会话日志。'}</p>}
    {snapshot !== null && <section className="seelogLayout">
      <div className="seelogMap"><LoopMap snapshot={snapshot} selectedId={selectedNode?.id ?? null} onSelect={selectNode} /></div>
      <aside className="seelogSide">
        <h2>节点检查器</h2>
        {selectedNode === null
          ? <p className="seelogEmpty">点击环上的节点圆点查看语义信息。</p>
          : <div className="seelogDetail">
              <b>{describeNode(selectedNode).title}</b>
              <p>{describeNode(selectedNode).summary}</p>
              {detailFor(selectedNode).map(([label, value]) => (
                <p key={label}>
                  {label}<br /><b>{value}</b>
                </p>
              ))}
              {detailLoading && <p className="seelogLoading">正在读取完整原始日志...</p>}
              {detailError !== null && <p className="seelogError">{detailError}</p>}
              {eventDetail !== null && (
                <details className="seelogRaw">
                  <summary>{eventTypeName(eventDetail.target.type)} · 原始日志 #{String(eventDetail.target.seq)}</summary>
                  <pre>{JSON.stringify(eventDetail.target, null, 2)}</pre>
                  <p>相邻日志</p>
                  <ul>{eventDetail.context.map(event => <li key={event.seq}>{eventTypeName(event.type)} · seq {String(event.seq)}</li>)}</ul>
                </details>
              )}
            </div>}
      </aside>
    </section>}
    {snapshot?.truncated === true && <p className="seelogNotice">会话数量已达到部署上限，图中未包含其余子会话。</p>}
  </main>
}
