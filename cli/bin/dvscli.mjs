#!/usr/bin/env node
import { runCli } from '../src/runner.mjs'

const startMs = Date.now()

runCli(process.argv.slice(2))
	.then((code) => {
		const duration = Date.now() - startMs
		if (process.env.DVSCLI_DEBUG_RUNTIME) {
			process.stderr.write(`[dvscli] exited code=${code} duration=${duration}ms\n`)
		}
		process.exit(code || 0)
	})
	.catch((err) => {
		process.stderr.write(`[dvscli] unhandled error: ${err?.stack || err}\n`)
		process.exit(10)
	})
