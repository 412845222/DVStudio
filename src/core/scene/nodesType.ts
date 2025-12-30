// 兼容层：当前 nodesType 仍位于 UI 目录下，但核心逻辑需要引用它。
// 这里提供一个 core 入口，后续可把实现整体迁入 core 并保持 import 路径稳定。
export * from './nodesType/index'
