import type { LightingPreset } from './types'

export interface LightConfig {
	intensity: number
	position?: [number, number, number]
	color: string
}

export interface LightingPresetConfig {
	ambientIntensity: number
	ambientSkyColor?: string
	ambientGroundColor?: string
	mainLight: LightConfig
	fillLight: LightConfig
	rimLight: LightConfig
	environmentIntensity: number
	toneMappingExposure: number
	shadowBias?: number
	shadowRadius?: number
}

export interface GradientBackgroundPreset {
	topColor: string
	bottomColor: string
	offset: number
	exponent: number
}

export interface BackgroundPresets {
	dark: Record<string, GradientBackgroundPreset>
	light: Record<string, GradientBackgroundPreset>
}

export const LIGHTING_PRESETS: Record<LightingPreset, LightingPresetConfig> = {
	studio: {
		ambientIntensity: 0.6,
		ambientSkyColor: '#ffffff',
		ambientGroundColor: '#556677',
		mainLight: {
			intensity: 1.8,
			position: [6, 10, 6],
			color: '#ffffff'
		},
		fillLight: {
			intensity: 0.5,
			color: '#aaccff'
		},
		rimLight: {
			intensity: 0.7,
			color: '#88ccff'
		},
		environmentIntensity: 0.5,
		toneMappingExposure: 0.85,
		shadowBias: -0.0002,
		shadowRadius: 4
	},
	'soft-studio': {
		ambientIntensity: 0.3,
		ambientSkyColor: '#ffffff',
		ambientGroundColor: '#556677',
		mainLight: {
			intensity: 1.2,
			position: [6, 10, 6],
			color: '#ffffff'
		},
		fillLight: {
			intensity: 0.35,
			color: '#aabbdd'
		},
		rimLight: {
			intensity: 0.4,
			color: '#7799bb'
		},
		environmentIntensity: 0.45,
		toneMappingExposure: 0.8,
		shadowBias: -0.0002,
		shadowRadius: 4
	},
	outdoor: {
		ambientIntensity: 0.4,
		ambientSkyColor: '#ffffff',
		ambientGroundColor: '#556677',
		mainLight: {
			intensity: 2.0,
			position: [10, 15, 5],
			color: '#fff5e6'
		},
		fillLight: {
			intensity: 0.3,
			color: '#88bbff'
		},
		rimLight: {
			intensity: 0.25,
			color: '#88ccff'
		},
		environmentIntensity: 0.6,
		toneMappingExposure: 1.0,
		shadowBias: -0.0002,
		shadowRadius: 4
	},
	dark: {
		ambientIntensity: 0.15,
		ambientSkyColor: '#ffffff',
		ambientGroundColor: '#445566',
		mainLight: {
			intensity: 0.8,
			position: [5, 8, 5],
			color: '#ffffff'
		},
		fillLight: {
			intensity: 0.1,
			color: '#aaccff'
		},
		rimLight: {
			intensity: 1.5,
			color: '#4488ff'
		},
		environmentIntensity: 0.3,
		toneMappingExposure: 0.8,
		shadowBias: -0.0002,
		shadowRadius: 4
	},
	'no-light': {
		ambientIntensity: 1.0,
		ambientSkyColor: '#ffffff',
		ambientGroundColor: '#ffffff',
		mainLight: {
			intensity: 0,
			position: [8, 12, 8],
			color: '#ffffff'
		},
		fillLight: {
			intensity: 0,
			color: '#aaccff'
		},
		rimLight: {
			intensity: 0,
			color: '#88ccff'
		},
		environmentIntensity: 0,
		toneMappingExposure: 1.0,
		shadowBias: -0.0002,
		shadowRadius: 4
	},
	custom: {
		ambientIntensity: 0.5,
		ambientSkyColor: '#ffffff',
		ambientGroundColor: '#556677',
		mainLight: {
			intensity: 1.5,
			position: [8, 12, 8],
			color: '#ffffff'
		},
		fillLight: {
			intensity: 0.4,
			color: '#aaccff'
		},
		rimLight: {
			intensity: 0.6,
			color: '#88ccff'
		},
		environmentIntensity: 0.5,
		toneMappingExposure: 0.9,
		shadowBias: -0.0002,
		shadowRadius: 4
	}
}

export const GRADIENT_BACKGROUNDS: BackgroundPresets = {
	dark: {
		studio: {
			topColor: '#7a8a9a',
			bottomColor: '#4a5a6a',
			offset: 0.2,
			exponent: 0.4
		}
	},
	light: {
		studio: {
			topColor: '#f5f8fc',
			bottomColor: '#e8ecf2',
			offset: 0.2,
			exponent: 0.4
		}
	}
}

export function getLightingPreset(preset: LightingPreset): LightingPresetConfig {
	return LIGHTING_PRESETS[preset] || LIGHTING_PRESETS.studio
}

export function getGradientBackground(
	theme: 'dark' | 'light',
	name = 'studio'
): GradientBackgroundPreset {
	const presets = GRADIENT_BACKGROUNDS[theme]
	return presets[name] || presets.studio
}
