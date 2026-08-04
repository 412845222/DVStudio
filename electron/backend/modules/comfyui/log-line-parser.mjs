/**
 * log-line-parser — Pure functions for parsing streaming log output
 *
 * Handles pip-style progress bars that use \r (carriage return) for line overwrites.
 * Extracted from setup-service.mjs for testability.
 */

/**
 * @typedef {'stdout' | 'stderr'} LogStream
 */

/**
 * @typedef {Object} LogEvent
 * @property {'log'} type
 * @property {LogStream} stream
 * @property {string} message
 * @property {boolean} [overwrite]
 */

/**
 * @typedef {Object} LineParserState
 * @property {string} buf
 * @property {string} lastOverwriteMsg
 */

/**
 * @returns {LineParserState}
 */
export function createLineParserState() {
	return {
		buf: '',
		lastOverwriteMsg: ''
	}
}

/**
 * Process incoming stream data and produce log events.
 * Handles \n line breaks and \r progress bar overwrites.
 *
 * @param {LogStream} stream - 'stdout' or 'stderr'
 * @param {string | Buffer} newData - new chunk of data
 * @param {LineParserState} state - parser state (mutated in-place)
 * @param {boolean} [isEnd=false] - set to true when stream ends to flush remaining buffer
 * @returns {LogEvent[]} array of LogEvent objects
 */
export function processStreamData(stream, newData, state, isEnd = false) {
	/** @type {LogEvent[]} */
	const events = []
	const text = typeof newData === 'string' ? newData : newData.toString('utf-8')
	let buf = state.buf + text

	while (true) {
		const nlIdx = buf.indexOf('\n')
		if (nlIdx === -1) break
		let rawLine = buf.substring(0, nlIdx)
		buf = buf.substring(nlIdx + 1)
		rawLine = rawLine.replace(/\r$/, '')
		const crParts = rawLine.split('\r')
		const finalLine = crParts[crParts.length - 1].trim()
		if (finalLine) {
			events.push({ type: 'log', stream, message: finalLine })
			state.lastOverwriteMsg = ''
		}
	}

	if (!isEnd && buf.length > 0) {
		const crIdx = buf.lastIndexOf('\r')
		let progressContent = crIdx >= 0 ? buf.substring(crIdx + 1) : buf
		progressContent = progressContent.trim()
		if (progressContent && progressContent !== state.lastOverwriteMsg) {
			events.push({ type: 'log', stream, message: progressContent, overwrite: true })
			state.lastOverwriteMsg = progressContent
		}
	}

	if (isEnd && buf.trim()) {
		const crIdx = buf.lastIndexOf('\r')
		let finalContent = crIdx >= 0 ? buf.substring(crIdx + 1) : buf
		finalContent = finalContent.trim()
		if (finalContent) {
			events.push({ type: 'log', stream, message: finalContent })
			state.lastOverwriteMsg = ''
		}
		buf = ''
	}

	state.buf = buf
	return events
}
