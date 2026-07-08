/* eslint-disable @typescript-eslint/no-explicit-any */
type ThreeObject = any
type ThreeMesh = any
type ThreeMaterial = any
type ThreeGroup = any
type ThreeLineSegments = any

export type RenderMode = 
  | 'pbr'
  | 'solid-white'
  | 'normal'
  | 'unlit'
  | 'matcap'
  | 'texture-only'

export type LightingPreset = 
  | 'studio'
  | 'outdoor'
  | 'dark'
  | 'no-light'
  | 'custom'

export type TransformMode =
  | 'translate'
  | 'rotate'
  | 'scale'

export interface Model3DEditorOptions {
  nodeId: string
  projectId?: number
  models: EditorModelInfo[]
}

export interface EditorModelInfo {
  id: string
  name: string
  url: string
  assetUrl?: string
}

export interface LoadedEditorModel {
  id: string
  name: string
  url: string
  group: ThreeGroup
  originalMaterials: Map<ThreeMesh, ThreeMaterial | ThreeMaterial[]>
  wireframeHelpers: Map<ThreeMesh, ThreeLineSegments>
}

export interface OutlinerNode {
  id: string
  name: string
  type: 'model' | 'mesh' | 'light' | 'camera' | 'group'
  visible: boolean
  locked: boolean
  children: OutlinerNode[]
  object3D: ThreeObject
}

export interface EditorLoadProgress {
  stage: 'initializing' | 'loading' | 'processing' | 'textures' | 'building' | 'complete'
  progress: number
  message: string
}
