import type { InjectionKey, Ref } from 'vue'
import type { DwebCanvasGL } from '../../DwebGL/DwebCanvasGL'

export const DwebCanvasGLKey: InjectionKey<Ref<DwebCanvasGL | null>> = Symbol('DwebCanvasGL')
