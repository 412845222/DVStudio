export const EXIT_CODES = Object.freeze({
    OK: 0,
    CLIENT_NOT_RUNNING: 1,
    AUTH_FAILED: 2,
    INVALID_PARAMS: 3,
    NO_ACTIVE_PROJECT: 4,
    AGENT_NOT_READY: 5,
    TASK_FAILED: 6,
    EXPORT_FAILED: 7,
    TASK_TIMEOUT: 8,
    REQUEST_TIMEOUT: 9,
    INTERNAL_ERROR: 10,
    NOT_IMPLEMENTED: 64
})

export function getExitCodeName(code) {
    for (const [name, value] of Object.entries(EXIT_CODES)) {
        if (value === code) return name
    }
    return 'UNKNOWN'
}
