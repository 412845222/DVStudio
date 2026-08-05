const LOG_LEVELS = {
	debug: 0,
	info: 1,
	warn: 2,
	error: 3
}

const currentLevel = process.env.NODE_ENV === 'production' ? LOG_LEVELS.info : LOG_LEVELS.debug

function formatTimestamp() {
	return new Date().toISOString()
}

function formatArgs(args) {
	return args
		.map((arg) => {
			if (typeof arg === 'object' && arg !== null) {
				try {
					return JSON.stringify(arg, null, 2)
				} catch {
					return String(arg)
				}
			}
			return String(arg)
		})
		.join(' ')
}

export const logger = {
	debug: (...args) => {
		if (currentLevel <= LOG_LEVELS.debug) {
			console.log(`[${formatTimestamp()}] [DEBUG] [backend]`, formatArgs(args))
		}
	},
	info: (...args) => {
		if (currentLevel <= LOG_LEVELS.info) {
			console.log(`[${formatTimestamp()}] [INFO]  [backend]`, formatArgs(args))
		}
	},
	warn: (...args) => {
		if (currentLevel <= LOG_LEVELS.warn) {
			console.warn(`[${formatTimestamp()}] [WARN]  [backend]`, formatArgs(args))
		}
	},
	error: (...args) => {
		if (currentLevel <= LOG_LEVELS.error) {
			console.error(`[${formatTimestamp()}] [ERROR] [backend]`, formatArgs(args))
		}
	},
	child: (module) => ({
		debug: (...args) => logger.debug(`[${module}]`, ...args),
		info: (...args) => logger.info(`[${module}]`, ...args),
		warn: (...args) => logger.warn(`[${module}]`, ...args),
		error: (...args) => logger.error(`[${module}]`, ...args)
	})
}

export default logger
