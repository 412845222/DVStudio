// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { processStreamData, createLineParserState } from '../../../electron/backend/modules/comfyui/log-line-parser.mjs'

describe('log-line-parser: createLineParserState', () => {
	it('creates empty state', () => {
		const state = createLineParserState()
		expect(state.buf).toBe('')
		expect(state.lastOverwriteMsg).toBe('')
	})
})

describe('log-line-parser: processStreamData', () => {
	describe('basic line handling', () => {
		it('returns empty array for empty input', () => {
			const state = createLineParserState()
			const events = processStreamData('stdout', '', state)
			expect(events).toEqual([])
			expect(state.buf).toBe('')
		})

		it('emits a complete line ending with newline', () => {
			const state = createLineParserState()
			const events = processStreamData('stdout', 'Hello world\n', state)
			const normalEvents = events.filter(e => !e.overwrite)
			expect(normalEvents).toHaveLength(1)
			expect(normalEvents[0]).toEqual({
				type: 'log',
				stream: 'stdout',
				message: 'Hello world'
			})
			expect(state.buf).toBe('')
		})

		it('emits overwrite event for incomplete line without newline', () => {
			const state = createLineParserState()
			const events = processStreamData('stdout', 'Waiting for', state)
			expect(events).toHaveLength(1)
			expect(events[0].overwrite).toBe(true)
			expect(events[0].message).toBe('Waiting for')
			expect(state.buf).toBe('Waiting for')
		})

		it('combines buffered data with new chunk', () => {
			const state = createLineParserState()
			processStreamData('stdout', 'Hello ', state)
			const events = processStreamData('stdout', 'World\n', state)
			const normalEvents = events.filter(e => !e.overwrite)
			expect(normalEvents).toHaveLength(1)
			expect(normalEvents[0].message).toBe('Hello World')
		})

		it('handles multiple lines in one chunk', () => {
			const state = createLineParserState()
			const events = processStreamData('stdout', 'line1\nline2\nline3\n', state)
			const normalEvents = events.filter(e => !e.overwrite)
			expect(normalEvents).toHaveLength(3)
			expect(normalEvents[0].message).toBe('line1')
			expect(normalEvents[1].message).toBe('line2')
			expect(normalEvents[2].message).toBe('line3')
		})
	})

	describe('stream routing', () => {
		it('marks events as stdout', () => {
			const state = createLineParserState()
			const events = processStreamData('stdout', 'stdout msg\n', state)
			const normalEvent = events.find(e => !e.overwrite)
			expect(normalEvent.stream).toBe('stdout')
		})

		it('marks events as stderr', () => {
			const state = createLineParserState()
			const events = processStreamData('stderr', 'stderr msg\n', state)
			const normalEvent = events.find(e => !e.overwrite)
			expect(normalEvent.stream).toBe('stderr')
		})

		it('maintains separate buffers for stdout and stderr', () => {
			const stdoutState = createLineParserState()
			const stderrState = createLineParserState()
			processStreamData('stdout', 'stdout-part', stdoutState)
			processStreamData('stderr', 'stderr-part', stderrState)
			expect(stdoutState.buf).toBe('stdout-part')
			expect(stderrState.buf).toBe('stderr-part')
		})
	})

	describe('carriage return handling (progress bars)', () => {
		it('handles \\r\\n line endings', () => {
			const state = createLineParserState()
			const events = processStreamData('stdout', 'line with crlf\r\n', state)
			const normalEvents = events.filter(e => !e.overwrite)
			expect(normalEvents).toHaveLength(1)
			expect(normalEvents[0].message).toBe('line with crlf')
		})

		it('emits overwrite event for \\r progress updates', () => {
			const state = createLineParserState()
			const events = processStreamData('stdout', 'Progress: 10%\rProgress: 20%\rProgress: 30%', state, false)
			const overwriteEvents = events.filter(e => e.overwrite)
			expect(overwriteEvents.length).toBeGreaterThanOrEqual(1)
			expect(overwriteEvents[overwriteEvents.length - 1].message).toBe('Progress: 30%')
		})

		it('clears lastOverwriteMsg after a complete line', () => {
			const state = createLineParserState()
			processStreamData('stdout', 'Progress: 50%', state)
			expect(state.lastOverwriteMsg).toBe('Progress: 50%')
			processStreamData('stdout', ' complete\n', state)
			expect(state.lastOverwriteMsg).toBe('')
		})

		it('does not emit duplicate overwrite events for same content', () => {
			const state = createLineParserState()
			const events1 = processStreamData('stdout', 'Progress: 50%', state)
			state.buf = ''
			state.lastOverwriteMsg = 'Progress: 50%'
			const events2 = processStreamData('stdout', 'Progress: 50%', state)
			const totalOverwrites = [...events1, ...events2].filter(e => e.overwrite).length
			expect(totalOverwrites).toBe(1)
		})
	})

	describe('stream end (isEnd=true)', () => {
		it('flushes remaining buffer on end', () => {
			const state = createLineParserState()
			processStreamData('stdout', 'Final message', state, false)
			const events = processStreamData('stdout', '', state, true)
			expect(events).toHaveLength(1)
			expect(events[0].message).toBe('Final message')
			expect(events[0].overwrite).toBeFalsy()
			expect(state.buf).toBe('')
		})

		it('returns nothing on end when buffer is empty', () => {
			const state = createLineParserState()
			const events = processStreamData('stdout', '', state, true)
			expect(events).toEqual([])
		})

		it('flushes content before trailing \\r on end', () => {
			const state = createLineParserState()
			processStreamData('stdout', 'Working... 50%', state, false)
			processStreamData('stdout', '\rWorking... 100%', state, false)
			const firstOverwrites = state.lastOverwriteMsg
			expect(firstOverwrites).toBe('Working... 100%')
			const endEvents = processStreamData('stdout', '', state, true)
			expect(endEvents).toHaveLength(1)
			expect(endEvents[0].message).toBe('Working... 100%')
		})
	})

	describe('empty/whitespace lines', () => {
		it('skips empty lines', () => {
			const state = createLineParserState()
			const events = processStreamData('stdout', 'a\n\nb\n', state)
			const normalEvents = events.filter(e => !e.overwrite)
			expect(normalEvents).toHaveLength(2)
			expect(normalEvents[0].message).toBe('a')
			expect(normalEvents[1].message).toBe('b')
		})

		it('skips whitespace-only lines', () => {
			const state = createLineParserState()
			const events = processStreamData('stdout', 'a\n   \nb\n', state)
			const normalEvents = events.filter(e => !e.overwrite)
			expect(normalEvents).toHaveLength(2)
		})
	})

	describe('Buffer input', () => {
		it('accepts Buffer input', () => {
			const state = createLineParserState()
			const buf = Buffer.from('from buffer\n', 'utf-8')
			const events = processStreamData('stdout', buf, state)
			const normalEvents = events.filter(e => !e.overwrite)
			expect(normalEvents).toHaveLength(1)
			expect(normalEvents[0].message).toBe('from buffer')
		})
	})

	describe('realistic pip progress simulation', () => {
		it('handles incremental pip progress updates', () => {
			const state = createLineParserState()
			let allEvents = []

			allEvents = allEvents.concat(processStreamData('stdout', 'Collecting torch\n', state))
			allEvents = allEvents.concat(processStreamData('stdout', '  Downloading torch-2.5.0-cp311-cp311-win_amd64.whl (200 MB)\n', state))
			allEvents = allEvents.concat(processStreamData('stdout', '   0%|', state))
			allEvents = allEvents.concat(processStreamData('stdout', '          | 0.00/200M [00:00<?, ?B/s]\r  50%|#####     | 100M/200M [00:05<00:05, 20MB/s]\r 100%|##########| 200M/200M [00:10<00:00, 20MB/s]\n', state))
			allEvents = allEvents.concat(processStreamData('stdout', 'Installing collected packages: torch\n', state))
			allEvents = allEvents.concat(processStreamData('stdout', '', state, true))

			const normalLogs = allEvents.filter(e => !e.overwrite)
			const progressUpdates = allEvents.filter(e => e.overwrite)

			expect(normalLogs.find(e => e.message.includes('Collecting torch'))).toBeTruthy()
			expect(normalLogs.find(e => e.message.includes('Downloading torch'))).toBeTruthy()
			expect(normalLogs.find(e => e.message.includes('Installing collected packages'))).toBeTruthy()
			expect(normalLogs.find(e => e.message.includes('100%'))).toBeTruthy()

			expect(progressUpdates.length).toBeGreaterThanOrEqual(1)
		})
	})
})
