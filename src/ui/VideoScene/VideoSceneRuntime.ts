import type { InjectionKey, Ref } from 'vue'
import type { DwebCanvasGL } from '../../engine/webgl'

export const DwebCanvasGLKey: InjectionKey<Ref<DwebCanvasGL | null>> = Symbol('DwebCanvasGL')
