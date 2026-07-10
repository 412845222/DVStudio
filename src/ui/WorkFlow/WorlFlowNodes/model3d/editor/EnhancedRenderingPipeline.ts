import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { SSAOPass } from 'three/examples/jsm/postprocessing/SSAOPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js'
import { FXAAShader } from 'three/examples/jsm/shaders/FXAAShader.js'
import { ColorCorrectionShader } from 'three/examples/jsm/shaders/ColorCorrectionShader.js'

export interface SSAOOptions {
  kernelRadius?: number
  minDistance?: number
  maxDistance?: number
  enabled?: boolean
}

export interface BloomOptions {
  strength?: number
  radius?: number
  threshold?: number
  enabled?: boolean
}

export interface ColorCorrectionOptions {
  powRGB?: [number, number, number]
  mulRGB?: [number, number, number]
  enabled?: boolean
}

export interface PipelineOptions {
  ssao?: SSAOOptions | false
  bloom?: BloomOptions | false
  colorCorrection?: ColorCorrectionOptions | false
  fxaa?: boolean
  width?: number
  height?: number
}

const DEFAULT_SSAO: Required<SSAOOptions> = {
  kernelRadius: 12,
  minDistance: 0.01,
  maxDistance: 0.15,
  enabled: true
}

const DEFAULT_BLOOM: Required<BloomOptions> = {
  strength: 0.03,
  radius: 0.3,
  threshold: 0.9,
  enabled: true
}

const DEFAULT_COLOR_CORRECTION: Required<ColorCorrectionOptions> = {
  powRGB: [1.1, 1.1, 1.12],
  mulRGB: [1.0, 1.0, 1.02],
  enabled: true
}

export class EnhancedRenderingPipeline {
  private renderer: any
  private scene: any
  private camera: any

  public composer: any
  public renderPass: any

  public ssaoPass: any = null
  public bloomPass: any = null
  public colorCorrectionPass: any = null
  public fxaaPass: any = null

  private _width: number
  private _height: number
  private _pixelRatio: number

  constructor(
    renderer: any,
    scene: any,
    camera: any,
    options: PipelineOptions = {}
  ) {
    this.renderer = renderer
    this.scene = scene
    this.camera = camera

    this._width = options.width || 800
    this._height = options.height || 600
    this._pixelRatio = renderer.getPixelRatio()

    this.composer = new EffectComposer(renderer)
    this.renderPass = new RenderPass(scene, camera)
    this.composer.addPass(this.renderPass)

    if (options.ssao !== false) {
      this.addSSAO(options.ssao || {})
    }
    if (options.bloom !== false) {
      this.addBloom(options.bloom || {})
    }
    if (options.colorCorrection !== false) {
      this.addColorCorrection(options.colorCorrection || {})
    }
    if (options.fxaa !== false) {
      this.addFXAA()
    }
  }

  addSSAO(options: SSAOOptions = {}): void {
    const opts = { ...DEFAULT_SSAO, ...options }
    this.ssaoPass = new SSAOPass(this.scene, this.camera, this._width, this._height)
    this.ssaoPass.kernelRadius = opts.kernelRadius
    this.ssaoPass.minDistance = opts.minDistance
    this.ssaoPass.maxDistance = opts.maxDistance
    this.ssaoPass.enabled = opts.enabled
    this.composer.addPass(this.ssaoPass)
  }

  addBloom(options: BloomOptions = {}): void {
    const opts = { ...DEFAULT_BLOOM, ...options }
    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(this._width, this._height),
      opts.strength,
      opts.radius,
      opts.threshold
    )
    this.bloomPass.enabled = opts.enabled
    this.composer.addPass(this.bloomPass)
  }

  addColorCorrection(options: ColorCorrectionOptions = {}): void {
    const opts = { ...DEFAULT_COLOR_CORRECTION, ...options }
    this.colorCorrectionPass = new ShaderPass(ColorCorrectionShader)
    this.colorCorrectionPass.uniforms['powRGB'].value = new THREE.Vector3(...opts.powRGB)
    this.colorCorrectionPass.uniforms['mulRGB'].value = new THREE.Vector3(...opts.mulRGB)
    this.colorCorrectionPass.enabled = opts.enabled
    this.composer.addPass(this.colorCorrectionPass)
  }

  addFXAA(): void {
    this.fxaaPass = new ShaderPass(FXAAShader)
    this.fxaaPass.uniforms['resolution'].value.set(
      1 / (this._width * this._pixelRatio),
      1 / (this._height * this._pixelRatio)
    )
    this.composer.addPass(this.fxaaPass)
  }

  setSSAOEnabled(enabled: boolean): void {
    if (this.ssaoPass) {
      this.ssaoPass.enabled = enabled
    }
  }

  setBloomEnabled(enabled: boolean): void {
    if (this.bloomPass) {
      this.bloomPass.enabled = enabled
    }
  }

  setBloomStrength(strength: number): void {
    if (this.bloomPass) {
      this.bloomPass.strength = strength
    }
  }

  setColorCorrectionEnabled(enabled: boolean): void {
    if (this.colorCorrectionPass) {
      this.colorCorrectionPass.enabled = enabled
    }
  }

  setExposure(exposure: number): void {
    this.renderer.toneMappingExposure = exposure
  }

  setSize(width: number, height: number): void {
    this._width = width
    this._height = height
    this.composer.setSize(width, height)

    if (this.ssaoPass) {
      this.ssaoPass.setSize(width, height)
    }
    if (this.bloomPass) {
      this.bloomPass.resolution = new THREE.Vector2(width, height)
    }
    if (this.fxaaPass) {
      this.fxaaPass.uniforms['resolution'].value.set(
        1 / (width * this._pixelRatio),
        1 / (height * this._pixelRatio)
      )
    }
  }

  setPixelRatio(ratio: number): void {
    this._pixelRatio = ratio
    if (this.fxaaPass) {
      this.fxaaPass.uniforms['resolution'].value.set(
        1 / (this._width * ratio),
        1 / (this._height * ratio)
      )
    }
  }

  render(delta?: number): void {
    this.composer.render(delta)
  }

  dispose(): void {
    if (this.ssaoPass) this.ssaoPass.dispose()
    if (this.bloomPass) this.bloomPass.dispose()
    if (this.colorCorrectionPass) this.colorCorrectionPass.dispose()
    if (this.fxaaPass) this.fxaaPass.dispose()
    this.composer.dispose()
  }
}
