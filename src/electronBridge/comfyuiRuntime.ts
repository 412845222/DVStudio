type ComfyRuntimeResponse = {
	ok: boolean
	error?: string
	message?: string
	[key: string]: unknown
}
type Invoke = (payload: Record<string, unknown>) => Promise<ComfyRuntimeResponse>

/** Runtime channels use a flat {ok, ...fields} envelope; preserve it for callers. */
export async function callComfyRuntime(
	action: 'list' | 'resolveHistory' | 'run',
	payload: Record<string, unknown>
): Promise<ComfyRuntimeResponse> {
	const bridge =
		typeof window === 'undefined'
			? undefined
			: (
					window as unknown as {
						dweb?: {
							comfyui?: {
								runtime?: { run?: Invoke; workflows?: { list?: Invoke; resolveHistory?: Invoke } }
							}
						}
					}
				).dweb?.comfyui?.runtime
	const invoke = action === 'run' ? bridge?.run : bridge?.workflows?.[action]
	if (!invoke) return { ok: false, error: 'IPC not available' }
	// Protect the runtime's flat envelope from ipcCall's generic unwrapping.
	const result = await ipcCall<ComfyRuntimeResponse>(async () => ({
		ok: true,
		value: await invoke(payload)
	}))
	return result && typeof result.ok === 'boolean'
		? result
		: { ok: false, error: 'Invalid ComfyUI IPC response' }
}
import { ipcCall } from '../network/ipcClient'
