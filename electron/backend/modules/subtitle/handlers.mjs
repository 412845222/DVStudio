// subtitle module handlers - connect to Python Bridge

import { getPythonBridge } from '../../python-bridge/index.mjs'

/**
 * Ping subtitle service via Python Bridge
 * Router signature: (ctx, payload, event) for regular handlers
 */
export async function subtitlePing(_ctx, _payload) {
	const bridge = getPythonBridge()
	return bridge.call('subtitle.ping', {})
}

/**
 * Stream subtitle understanding via Python Bridge
 * Stream handlers receive (event, payload) via createStreamHandler -> wrapper passes (ctx, payload, event)
 * Must return an AsyncGenerator
 */
export async function* subtitleUnderstandStream(_ctx, payload) {
	const bridge = getPythonBridge()
	for await (const chunk of bridge.callStream('subtitle.understand:stream', payload || {})) {
		yield chunk
	}
}

/**
 * Stream subtitle chat via Python Bridge
 */
export async function* subtitleChatStream(_ctx, payload) {
	const bridge = getPythonBridge()
	for await (const chunk of bridge.callStream('subtitle.chat:stream', payload || {})) {
		yield chunk
	}
}

/**
 * Stream style analysis via Python Bridge
 */
export async function* subtitleStyleStream(_ctx, payload) {
	const bridge = getPythonBridge()
	for await (const chunk of bridge.callStream('subtitle.style:stream', payload || {})) {
		yield chunk
	}
}

/**
 * Stream template suggestions via Python Bridge
 */
export async function* subtitleTemplatesStream(_ctx, payload) {
	const bridge = getPythonBridge()
	for await (const chunk of bridge.callStream('subtitle.templates:stream', payload || {})) {
		yield chunk
	}
}

/**
 * Stream palette generation via Python Bridge
 */
export async function* subtitlePaletteStream(_ctx, payload) {
	const bridge = getPythonBridge()
	for await (const chunk of bridge.callStream('subtitle.palette:stream', payload || {})) {
		yield chunk
	}
}

/**
 * Stream panel chat via Python Bridge
 */
export async function* subtitlePanelChatStream(_ctx, payload) {
	const bridge = getPythonBridge()
	for await (const chunk of bridge.callStream('subtitle.panel-chat:stream', payload || {})) {
		yield chunk
	}
}

/**
 * Stream single template generation via Python Bridge
 */
export async function* subtitleTemplateStream(_ctx, payload) {
	const bridge = getPythonBridge()
	for await (const chunk of bridge.callStream('subtitle.template:stream', payload || {})) {
		yield chunk
	}
}
