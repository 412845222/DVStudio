/**
 * JSON-RPC Transport for stdio communication with Python worker
 *
 * Provides:
 * - Line-based serialization (NDJSON)
 * - Response routing by request ID
 * - Stream handling for generator functions
 */

import { Writable, Readable } from 'node:stream'

/**
 * Create a line writer for stdin
 */
export function createLineWriter(stdin) {
	return {
		write(line) {
			if (!stdin || stdin.destroyed) {
				throw new Error('stdin stream is not available')
			}
			stdin.write(line + '\n')
		},
		end() {
			stdin?.end()
		}
	}
}

/**
 * Create a line reader for stdout/stderr
 */
export function createLineReader(stream) {
	const listeners = []
	let buffer = ''

	stream.on('data', (chunk) => {
		buffer += chunk.toString('utf-8')

		// Split by newlines and emit complete lines
		const lines = buffer.split('\n')
		buffer = lines.pop() || '' // Keep incomplete line in buffer

		for (const line of lines) {
			if (line.trim()) {
				for (const listener of listeners) {
					listener(line.trim())
				}
			}
		}
	})

	stream.on('end', () => {
		// Emit any remaining content
		if (buffer.trim()) {
			for (const listener of listeners) {
				listener(buffer.trim())
			}
		}
	})

	return {
		onLine(listener) {
			listeners.push(listener)
		},
		offLine(listener) {
			const idx = listeners.indexOf(listener)
			if (idx >= 0) listeners.splice(idx, 1)
		}
	}
}

/**
 * JSON-RPC Transport class
 */
export class JsonRpcTransport {
	constructor(writer, reader) {
		this.writer = writer
		this.reader = reader

		this.responseListeners = []
		this.oneTimeListeners = []

		// Set up response listener
		this.reader.onLine((line) => {
			try {
				const response = JSON.parse(line)

				// Check for valid JSON-RPC response
				if (response.jsonrpc !== '2.0') {
					console.warn('Invalid JSON-RPC response:', line)
					return
				}

				// Dispatch to permanent listeners
				for (const listener of this.responseListeners) {
					listener(response)
				}

				// Dispatch to one-time listeners (and remove them)
				const remaining = []
				for (const { id, listener, once } of this.oneTimeListeners) {
					if (response.id === id) {
						listener(response)
						if (!once) remaining.push({ id, listener, once })
					} else {
						remaining.push({ id, listener, once })
					}
				}
				this.oneTimeListeners = remaining
			} catch (err) {
				console.warn('Failed to parse JSON-RPC response:', line, err.message)
			}
		})
	}

	/**
	 * Send a JSON-RPC request
	 */
	async send(request) {
		const line = JSON.stringify(request)
		this.writer.write(line)
	}

	/**
	 * Register a permanent response listener
	 */
	onResponse(listener) {
		this.responseListeners.push(listener)
	}

	/**
	 * Remove a response listener
	 */
	offResponse(listener) {
		const idx = this.responseListeners.indexOf(listener)
		if (idx >= 0) this.responseListeners.splice(idx, 1)
	}

	/**
	 * Register a one-time listener for a specific request ID
	 */
	onceResponse(listener, requestId = null) {
		this.oneTimeListeners.push({
			id: requestId,
			listener,
			once: true
		})
	}

	/**
	 * Register a multi-response listener for streaming (not auto-removed)
	 */
	onStreamResponse(requestId, listener) {
		this.oneTimeListeners.push({
			id: requestId,
			listener,
			once: false
		})
	}

	/**
	 * Remove a stream listener
	 */
	offStreamResponse(listener) {
		this.oneTimeListeners = this.oneTimeListeners.filter((l) => l.listener !== listener)
	}
}

/**
 * Error codes matching Python side
 */
export const ErrorCodes = {
	PARSE_ERROR: -32700,
	INVALID_REQUEST: -32600,
	METHOD_NOT_FOUND: -32601,
	INVALID_PARAMS: -32602,
	INTERNAL_ERROR: -32603,
	CANCELLED: -32000
}

/**
 * Check if response is an error
 */
export function isError(response) {
	return response && response.error !== undefined
}

/**
 * Extract error info from response
 */
export function getError(response) {
	if (!response?.error) return null
	return {
		code: response.error.code,
		message: response.error.message,
		data: response.error.data
	}
}
