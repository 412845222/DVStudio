/* eslint-disable @typescript-eslint/no-explicit-any */
declare module 'three' {
  const THREE: any
  export = THREE
}

declare module 'three/examples/jsm/controls/OrbitControls.js' {
  export class OrbitControls {
    constructor(...args: any[])
    [key: string]: any
  }
}

declare module 'three/examples/jsm/controls/TransformControls.js' {
  export class TransformControls {
    constructor(...args: any[])
    [key: string]: any
  }
}

declare module 'three/examples/jsm/loaders/GLTFLoader.js' {
  export class GLTFLoader {
    constructor(...args: any[])
    [key: string]: any
  }
}

declare module 'three/examples/jsm/loaders/DRACOLoader.js' {
  export class DRACOLoader {
    constructor(...args: any[])
    [key: string]: any
  }
}

declare module 'three/examples/jsm/loaders/OBJLoader.js' {
  export class OBJLoader {
    constructor(...args: any[])
    [key: string]: any
  }
}

declare module 'three/examples/jsm/postprocessing/EffectComposer.js' {
  export class EffectComposer {
    constructor(...args: any[])
    [key: string]: any
  }
}

declare module 'three/examples/jsm/postprocessing/RenderPass.js' {
  export class RenderPass {
    constructor(...args: any[])
    [key: string]: any
  }
}

declare module 'three/examples/jsm/postprocessing/UnrealBloomPass.js' {
  export class UnrealBloomPass {
    constructor(...args: any[])
    [key: string]: any
  }
}

declare module 'three/examples/jsm/postprocessing/ShaderPass.js' {
  export class ShaderPass {
    constructor(...args: any[])
    [key: string]: any
  }
}

declare module 'three/examples/jsm/shaders/FXAAShader.js' {
  export const FXAAShader: any
}

declare module 'three/examples/jsm/environments/RoomEnvironment.js' {
  export class RoomEnvironment {
    constructor(...args: any[])
    [key: string]: any
  }
}

declare module 'three/examples/jsm/exporters/GLTFExporter.js' {
  export class GLTFExporter {
    constructor(...args: any[])
    [key: string]: any
  }
}

declare module 'three/examples/jsm/lights/RectAreaLightUniformsLib.js' {
  export const RectAreaLightUniformsLib: any
}
