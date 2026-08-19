import http from 'node:http'
import { EXIT_CODES } from './exitCodes.mjs'

const TOKEN_HEADER = 'x-dvs-cli-token'

function request({ method, host, port, path, token, body, timeoutMs = 30000 }) {
    return new Promise((resolve) => {
        const headers = {}
        if (token) headers[TOKEN_HEADER] = token
        let bodyData = null
        if (body !== undefined) {
            bodyData = JSON.stringify(body)
            headers['Content-Type'] = 'application/json'
            headers['Content-Length'] = Buffer.byteLength(bodyData)
        }
        const req = http.request({
            hostname: host,
            port,
            path,
            method,
            headers,
            timeout: timeoutMs
        }, (res) => {
            let data = ''
            res.on('data', (c) => { data += c })
            res.on('end', () => {
                let parsed = null
                try { parsed = data ? JSON.parse(data) : null }
                catch { parsed = { ok: false, error: 'INVALID_RESPONSE', raw: data } }
                resolve({ status: res.statusCode, data: parsed, raw: data })
            })
        })
        req.on('error', (err) => {
            if (err.code === 'ECONNREFUSED') {
                resolve({ connectionError: 'CLIENT_NOT_RUNNING', status: 0, message: err.message })
            } else {
                resolve({ connectionError: 'REQUEST_ERROR', status: 0, message: err.message })
            }
        })
        req.on('timeout', () => {
            req.destroy()
            resolve({ connectionError: 'TIMEOUT', status: 0, message: `Request timed out (>${timeoutMs}ms)` })
        })
        if (bodyData) req.write(bodyData)
        req.end()
    })
}

export async function getHealth(instance, timeoutMs = 5000) {
    return request({
        method: 'GET',
        host: instance.host,
        port: instance.port,
        path: '/health',
        token: '',
        timeoutMs
    })
}

export async function get(instance, path, timeoutMs = 30000) {
    return request({
        method: 'GET',
        host: instance.host,
        port: instance.port,
        path,
        token: instance.token,
        timeoutMs
    })
}

export async function post(instance, path, body, timeoutMs = 600000) {
    return request({
        method: 'POST',
        host: instance.host,
        port: instance.port,
        path,
        token: instance.token,
        body,
        timeoutMs
    })
}

/**
 * 把响应结果映射为 CLI 退出码
 */
export function mapResponseToExitCode(response, fallback = EXIT_CODES.INTERNAL_ERROR) {
    if (response.connectionError === 'CLIENT_NOT_RUNNING') return EXIT_CODES.CLIENT_NOT_RUNNING
    if (response.connectionError === 'TIMEOUT') return EXIT_CODES.REQUEST_TIMEOUT
    if (response.status === 401) return EXIT_CODES.AUTH_FAILED
    if (response.status === 400 && response.data?.error === 'INVALID_PARAMS') return EXIT_CODES.INVALID_PARAMS
    if (response.status === 404) return EXIT_CODES.NO_ACTIVE_PROJECT
    if (response.status >= 500) return fallback
    return EXIT_CODES.OK
}
