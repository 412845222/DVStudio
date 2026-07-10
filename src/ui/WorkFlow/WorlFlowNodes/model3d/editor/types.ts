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
  | 'soft-studio'
  | 'outdoor'
  | 'dark'
  | 'no-light'
  | 'custom'

export interface ManualLightingParams {
  ambientIntensity?: number
  mainLightIntensity?: number
  fillLightIntensity?: number
  rimLightIntensity?: number
  exposure?: number
  lightAzimuth?: number
  lightElevation?: number
}

export interface RenderingQualityOptions {
  ssaoEnabled: boolean
  colorCorrectionEnabled: boolean
  bloomStrength: number
  bloomRadius: number
  bloomThreshold: number
  toneMappingExposure: number
  environmentIntensity: number
}

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
  objectUuid: string
}

export interface EditorLoadProgress {
  stage: 'initializing' | 'loading' | 'processing' | 'textures' | 'building' | 'complete'
  progress: number
  message: string
}
