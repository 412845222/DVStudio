import * as THREE from 'three'

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
  group: THREE.Group
  originalMaterials: Map<THREE.Mesh, THREE.Material | THREE.Material[]>
  wireframeHelpers: Map<THREE.Mesh, THREE.LineSegments>
}

export interface OutlinerNode {
  id: string
  name: string
  type: 'model' | 'mesh' | 'light' | 'camera' | 'group'
  visible: boolean
  locked: boolean
  children: OutlinerNode[]
  object3D: THREE.Object3D
}

export interface EditorLoadProgress {
  stage: 'initializing' | 'loading' | 'processing' | 'textures' | 'building' | 'complete'
  progress: number
  message: string
}

export interface IOpen3DEditorPayload {
  nodeId: string
  projectId?: number
  models: EditorModelInfo[]
}

export interface IOpen3DEditorResult {
  ok: boolean
  error?: string
  focused?: boolean
}

export interface DwebWindowAPI {
  open3dEditor: (payload: IOpen3DEditorPayload) => Promise<IOpen3DEditorResult>
}

declare global {
  interface Window {
    dweb?: {
      window?: DwebWindowAPI & {
        minimize: () => Promise<{ ok: boolean; error?: string }>
        toggleMaximize: () => Promise<{ ok: boolean; maximized?: boolean; error?: string }>
        isMaximized: () => Promise<{ ok: boolean; maximized?: boolean; error?: string }>
        close: () => Promise<{ ok: boolean; error?: string }>
        reload: () => Promise<{ ok: boolean; error?: string }>
        openDevTools: () => Promise<{ ok: boolean; opened?: boolean; error?: string }>
      }
    }
  }
}
