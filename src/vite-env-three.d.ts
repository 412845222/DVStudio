/* eslint-disable @typescript-eslint/no-explicit-any */
declare module 'three' {
  const THREE: any
  export = THREE
}

declare module 'three/examples/jsm/controls/OrbitControls.js' {
  export const OrbitControls: any
}

declare module 'three/examples/jsm/controls/TransformControls.js' {
  export const TransformControls: any
}

declare module 'three/examples/jsm/loaders/GLTFLoader.js' {
  export const GLTFLoader: any
}

declare module 'three/examples/jsm/exporters/GLTFExporter.js' {
  export const GLTFExporter: any
}
