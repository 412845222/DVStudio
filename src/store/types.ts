// ============================================================================
// Vuex Store 类型辅助工具
// 用途：项目使用多 Store 实例 + provide/inject 模式，本文件提供类型辅助
//
// 架构说明：
// - 每个模块（AIWorkflow, VideoScene, Timeline, VideoStudio, Theme）有独立 Store
// - 通过 provide/inject + InjectionKey 传递，使用 useStore<State>(Key) 获取
// - 不是单一 root store，不存在 RootState
// ============================================================================

import type { Store } from 'vuex'
import type { InjectionKey } from 'vue'

// ─── Store 类型辅助 ─────────────────────────────────────────────────────────

/**
 * 从 InjectionKey 中提取 Store 的 State 类型
 * 用法：type State = StoreState<typeof AIWorkflowKey>
 */
export type StoreState<K> = K extends InjectionKey<Store<infer S>> ? S : never

/**
 * 类型化的 Store 类型（给 useStore 返回值使用）
 * 用法：const store = useStore(AIWorkflowKey) as TypedStore<WorkflowState>
 */
export type TypedStore<S> = Store<S>

// ─── Mutation/Action 辅助类型 ──────────────────────────────────────────────

/**
 * Mutation 函数类型
 */
export type MutationFn<S, P = void> = (state: S, payload: P) => void

/**
 * Action 上下文类型
 */
export interface ActionContext<S> {
  state: S
  commit: (type: string, payload?: unknown, options?: { root?: boolean }) => void
  dispatch: (type: string, payload?: unknown, options?: { root?: boolean }) => Promise<unknown>
  getters: Record<string, unknown>
}

/**
 * Action 函数类型
 */
export type ActionFn<S, P = void, R = unknown> = (
  context: ActionContext<S>,
  payload: P
) => Promise<R> | R
