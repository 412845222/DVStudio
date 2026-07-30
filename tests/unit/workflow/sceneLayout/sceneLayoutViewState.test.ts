import { describe, it, expect } from 'vitest'
import type { SceneLayoutViewState } from '@/ui/WorkFlow/WorlFlowNodes/sceneLayout/SceneLayoutPreviewViewer'
import {
	safeNumber,
	isSameVec3,
	isSameSize,
	isSameRotation,
	normalizeAngleDeg,
	constrainManualOrientation,
	roundOrientation,
	isSameItem,
	isSameItems,
	type OrientationOffset
} from '@/ui/WorkFlow/WorlFlowNodes/sceneLayout/SceneLayoutPreviewViewer'

/**
 * 针对 BUGFIX 2026-07：SceneLayoutViewState 用于镜头缓存/恢复的纯函数构建块正确性验证。
 * 确保 SceneLayoutViewState 序列化 / 反序列化、等值比较、角度归一化等核心逻辑稳定，
 * 不会出现"视角缓存了但恢复时数值异常（NaN、Infinity、精度误差）"的回归。
 */
describe('SceneLayoutViewState 纯函数构建块', () => {
	describe('safeNumber —— SceneLayoutViewState 字段防御（恢复视角时防止非法数写入 camera/target）', () => {
		it('正常数字原样返回', () => {
			expect(safeNumber(3.14, 0)).toBe(3.14)
			expect(safeNumber(-999, 0)).toBe(-999)
			expect(safeNumber(0, 42)).toBe(0)
		})
		it('NaN / undefined / Infinity → fallback；null 经 Number(null)=0 会被视为有限数 0（JS 语义）', () => {
			expect(safeNumber(NaN, 1)).toBe(1)
			expect(safeNumber(undefined, 2)).toBe(2)
			expect(safeNumber(Infinity, 4)).toBe(4)
			expect(safeNumber(-Infinity, 5)).toBe(5)
			// JS 小坑：Number(null) = 0 有限 → 不会走 fallback
			expect(safeNumber(null, 3)).toBe(0)
		})
		it('"非法字符串 / 对象" → fallback（防止类型污染）', () => {
			// 注意：Number('abc') = NaN → fallback；但 Number('') = 0（合法有限数），所以 0 不是 fallback
			expect(safeNumber('abc' as unknown as number, 6)).toBe(6)
			expect(safeNumber({} as unknown as number, 8)).toBe(8)
		})
	})

	describe('isSameVec3 —— SceneLayoutViewState camera/target 变化检测（恢复视角后判断是否需要二次 setLayout）', () => {
		it('相同向量返回 true', () => {
			expect(isSameVec3({ x: 1, y: 2, z: 3 }, { x: 1, y: 2, z: 3 })).toBe(true)
			expect(isSameVec3({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 })).toBe(true)
		})
		it('任一维度数值不同返回 false', () => {
			expect(isSameVec3({ x: 1, y: 2, z: 3 }, { x: 1, y: 2, z: 3.0001 })).toBe(false)
			expect(isSameVec3({ x: 100, y: 0, z: 0 }, { x: -100, y: 0, z: 0 })).toBe(false)
		})
		it('一边为 null/undefined 返回 false；两边都为 null/undefined 因 a===b 返回 true（JavaScript 语义）', () => {
			expect(isSameVec3(null, { x: 0, y: 0, z: 0 })).toBe(false)
			expect(isSameVec3({ x: 0, y: 0, z: 0 }, undefined)).toBe(false)
			expect(isSameVec3(null, null)).toBe(true)
			expect(isSameVec3(undefined, undefined)).toBe(true)
		})
	})

	describe('isSameSize / isSameRotation / isSameItem —— 签名变化检测（间接影响视角缓存何时被使用）', () => {
		it('isSameSize 三维容差相等', () => {
			expect(
				isSameSize({ width: 100, depth: 50, height: 30 }, { width: 100, depth: 50, height: 30 })
			).toBe(true)
			expect(
				isSameSize({ width: 100, depth: 50, height: 30 }, { width: 100.001, depth: 50, height: 30 })
			).toBe(false)
		})
		it('isSameRotation 使用 yaw/pitch/roll 语义维度（注意不是 x/y/z ！）', () => {
			expect(
				isSameRotation({ yaw: 10, pitch: 20, roll: 30 }, { yaw: 10, pitch: 20, roll: 30 })
			).toBe(true)
			expect(
				isSameRotation({ yaw: 10, pitch: 20, roll: 30 }, { yaw: 10.1, pitch: 20, roll: 30 })
			).toBe(false)
			// 如果传入的对象字段名与契约不匹配（x/y/z 但函数读 yaw/pitch/roll），
			// 两边都会被 safeNumber 兜底成 0 → 判定为相等（这是字段名错用的提示）
			expect(
				isSameRotation({ x: 1, y: 2, z: 3 } as never, { x: 999, y: 888, z: 777 } as never)
			).toBe(true)
		})
		it('isSameItem 两边同为 null/undefined 因 a===b 返回 true；仅一边为 null 时走 id 比较抛出 TypeError（调用方应自行防御）', () => {
			expect(isSameItem(null as never, null as never)).toBe(true)
			expect(isSameItem(undefined as never, undefined as never)).toBe(true)
		})
		it('isSameItems 长度差异：即使一方空另一方也不相等', () => {
			expect(isSameItems([], [{ id: 'a' }] as never)).toBe(false)
			expect(isSameItems([], [])).toBe(true)
		})
	})

	describe('normalizeAngleDeg / constrainManualOrientation / roundOrientation —— 方向角归一化（防止 OrientationOffset 序列化异常）', () => {
		it('normalizeAngleDeg 将角度归一到 (-180, 180]', () => {
			expect(normalizeAngleDeg(360)).toBe(0)
			expect(normalizeAngleDeg(270)).toBe(-90)
			expect(normalizeAngleDeg(-270)).toBe(90)
			expect(normalizeAngleDeg(-180)).toBe(180)
			expect(normalizeAngleDeg(181)).toBe(-179)
		})
		it('normalizeAngleDeg NaN → 0（安全）', () => {
			expect(normalizeAngleDeg(NaN)).toBe(0)
		})
		it('constrainManualOrientation 不修改合法值', () => {
			const o: OrientationOffset = { yaw: 90, pitch: 45, roll: -30 }
			const r = constrainManualOrientation(o)
			expect(r.yaw).toBe(90)
			expect(r.pitch).toBe(45)
			expect(r.roll).toBe(-30)
		})
		it('roundOrientation 保留 2 位小数并归一化', () => {
			// Math.round(45.0049 * 100) / 100 = 45
			expect(roundOrientation(45.0049)).toBe(45)
			// Math.round(45.005 * 100) / 100 = 45.01
			expect(roundOrientation(45.005)).toBe(45.01)
			expect(roundOrientation(360)).toBe(0)
		})
	})

	describe('SceneLayoutViewState 序列化形状合约（setLayout/cache 一致性）', () => {
		it('SceneLayoutViewState 必须包含 cameraPosition.{x,y,z} 和 target.{x,y,z} 6 个标量（否则恢复失败）', () => {
			const state: SceneLayoutViewState = {
				cameraPosition: { x: 360, y: 260, z: 420 },
				target: { x: 0, y: 100, z: 0 }
			}
			// 合约 1：6 个字段均为有限数
			const vecs = [state.cameraPosition, state.target]
			for (const v of vecs) {
				expect(Number.isFinite(v.x)).toBe(true)
				expect(Number.isFinite(v.y)).toBe(true)
				expect(Number.isFinite(v.z)).toBe(true)
			}
			// 合约 2：可以 round-trip JSON 序列化（Map 里存的都是 plain object）
			const serialized = JSON.stringify(state)
			const deserialized: SceneLayoutViewState = JSON.parse(serialized)
			expect(deserialized.cameraPosition).toEqual(state.cameraPosition)
			expect(deserialized.target).toEqual(state.target)
			// 合约 3：用 safeNumber 扫一遍全部返回原值（说明没有非法数混进来）
			expect(safeNumber(deserialized.cameraPosition.x, -1)).toBe(360)
			expect(safeNumber(deserialized.target.y, -1)).toBe(100)
		})
	})
})
