/*
 * harness 外部依赖的最小类型声明。
 *
 * 本仓库的既有风格（见 src/host/web.ts 顶部注释）是「不导入 @deepseek-ai 的类型，
 * 只声明与其契约一致的最小接口」，这样 typecheck 不依赖本地安装 harness 包，
 * 在任何机器上都能干净通过；运行时真实实现由 DSH 注入。
 *
 * 融合 dsh-seelog 的会话图半（src/host/map-web.ts）需要 schemastery 与 dsh-session
 * 的两个**值**导入（z、SessionId），无法改写成本地 interface，因此在此为它们提供
 * 环境声明；其余 dsh-host-webserver / dsh-session-query / cordis 均为纯类型依赖。
 *
 * 构建侧这些模块一律标记 external（见 tsdown.config.ts 的 platform 列表）。
 */

declare module '@deepseek-ai/schemastery' {
  /** schemastery 的 schema 对象：既是校验器也是类型载体。 */
  interface Schema<T> {
    (value?: unknown): T
    min(value: number): Schema<T>
    max(value: number): Schema<T>
    default(value: T): Schema<T>
  }
  interface SchemasteryStatic {
    <T>(value?: unknown): T
    object<T>(shape: Record<string, unknown>): Schema<T>
    natural(): Schema<number>
  }
  const z: SchemasteryStatic
  /**
   * schemastery 的 `z` 同时是值与泛型类型：`z<Config>` 表示「校验出 Config 的 schema」，
   * 上游 map-web.ts 用的就是这种写法（export const Config: z<Config> = z.object({...})）。
   */
  type z<T> = Schema<T>
  export default z
  export type { Schema, z }
}

declare module '@deepseek-ai/dsh-session' {
  /** 不透明的会话标识（运行时为带品牌的字符串）。 */
  export type SessionIdValue = string & { readonly __sessionId?: unique symbol }
  /** 把字符串收窄为会话标识。 */
  export function SessionId(value: string): SessionIdValue

  /**
   * durable log 中的一条事件。
   *
   * data 按 type 取不同形状，这里用宽松索引签名承载：会话图只读取少量叶子字段，
   * 逐一复刻 harness 的判别联合会随上游版本漂移而失效。
   */
  export interface SessionEvent {
    type: string
    seq: number
    time: number
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data: any
  }
}

declare module '@deepseek-ai/dsh-host-webserver' {}

declare module '@deepseek-ai/dsh-session-query' {
  import type { SessionEvent, SessionIdValue } from '@deepseek-ai/dsh-session'

  /** 会话头部信息。 */
  export interface SessionHeader {
    id: SessionIdValue
  }
  /** 谱系树中的一个节点。 */
  export interface SessionLineageNode {
    session: { header: SessionHeader }
    descendants: SessionLineageNode[]
  }
  /** traceSession 的返回。 */
  export interface SessionLineage {
    target: { header: SessionHeader }
    descendants: SessionLineageNode[]
  }
  /** readSession 的返回。 */
  export interface SessionLogRead {
    session: {
      createdAt: number
      seedLength?: number
      parentSession?: SessionIdValue
    }
    events: readonly SessionEvent[]
  }
  /** readEvent 的返回。 */
  export interface SessionEventRead {
    target: SessionEvent
    events: readonly SessionEvent[]
  }
  /** 只读会话查询服务。 */
  export interface SessionQuery {
    traceSession(sessionId: SessionIdValue): Promise<SessionLineage>
    readSession(sessionId: SessionIdValue): Promise<SessionLogRead>
    readEvent(request: {
      sessionId: SessionIdValue
      seq: number
      before?: number
      after?: number
    }): Promise<SessionEventRead>
  }
}

declare module '@deepseek-ai/dsh-client-runtime/client' {
  import type { ComponentType } from 'react'

  /** slots 服务：注册可卸载的 UI 贡献。 */
  export interface SlotsService {
    inject(name: string, register: () => unknown): unknown
    register(
      options: { name: string, id?: string, key?: string, order?: number, label?: () => string },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      component: ComponentType<any>,
    ): unknown
  }
  /** 浏览器端插件上下文（本插件只用到 slots 与 effect）。 */
  export interface ClientContext {
    slots: SlotsService
    effect(fn: () => unknown, label?: string): unknown
  }
}

declare module '@deepseek-ai/dsh-client-ui-conversation/client' {
  /** conversation.view 插槽传给会话视图的标准 props。 */
  export interface ConvViewProps {
    sessionId: string
  }
}

declare module '@deepseek-ai/cordis' {
  import type { IncomingMessage, ServerResponse } from 'node:http'
  import type { SessionQuery } from '@deepseek-ai/dsh-session-query'

  /** 与 dsh-host-webserver register 契约一致的最小 webServer 服务。 */
  export interface WebServer {
    register(options: {
      kind: 'exact' | 'prefix'
      path: string
      handler: (request: IncomingMessage, response: ServerResponse) => Promise<void> | void
    }): unknown
  }
  /** 会话图半用到的 Cordis 上下文切面。 */
  export interface Context {
    webServer: WebServer
    sessionQuery: SessionQuery
    effect(fn: () => unknown, label?: string): unknown
  }
}
