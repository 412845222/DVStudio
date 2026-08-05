import { ref, computed } from 'vue'

export type UploadTaskStatus = 'pending' | 'uploading' | 'completed' | 'error'

export interface UploadTask {
	id: string
	file: File
	name: string
	size: number
	prefix: string
	status: UploadTaskStatus
	progress: number
	error?: string
	publicUrl?: string
	key?: string
	createdAt: number
}

let queueInstance: ReturnType<typeof createUploadQueue> | null = null

function createUploadQueue() {
	const tasks = ref<UploadTask[]>([])
	let taskIdCounter = 0
	let isProcessing = false
	const maxConcurrent = 2

	const activeCount = computed(() => tasks.value.filter((t) => t.status === 'uploading').length)
	const pendingCount = computed(() => tasks.value.filter((t) => t.status === 'pending').length)
	const completedCount = computed(() => tasks.value.filter((t) => t.status === 'completed').length)
	const errorCount = computed(() => tasks.value.filter((t) => t.status === 'error').length)
	const totalCount = computed(() => tasks.value.length)
	const overallProgress = computed(() => {
		if (tasks.value.length === 0) return 0
		const total = tasks.value.reduce((sum, t) => sum + t.size, 0)
		if (total === 0) return 0
		const uploaded = tasks.value.reduce((sum, t) => sum + (t.size * t.progress) / 100, 0)
		return Math.round((uploaded / total) * 100)
	})
	const isActive = computed(() => activeCount.value > 0 || pendingCount.value > 0)
	const hasCompleted = computed(() => completedCount.value > 0 || errorCount.value > 0)
	const hasErrors = computed(() => errorCount.value > 0)
	const isAllDone = computed(() => !isActive.value && totalCount.value > 0)

	function generateId() {
		return `upload-${Date.now()}-${++taskIdCounter}`
	}

	function addFiles(files: File[], prefix: string = '') {
		const newTasks: UploadTask[] = files.map((file) => ({
			id: generateId(),
			file,
			name: file.name,
			size: file.size,
			prefix,
			status: 'pending' as UploadTaskStatus,
			progress: 0,
			createdAt: Date.now()
		}))
		tasks.value = [...newTasks, ...tasks.value]
		void processQueue()
		return newTasks.map((t) => t.id)
	}

	async function processQueue() {
		if (isProcessing) return
		isProcessing = true

		try {
			while (true) {
				const pendingTask = tasks.value.find((t) => t.status === 'pending')
				if (!pendingTask) break
				if (activeCount.value >= maxConcurrent) {
					await new Promise((resolve) => setTimeout(resolve, 200))
					continue
				}

				pendingTask.status = 'uploading'
				void uploadSingleTask(pendingTask)
			}
		} finally {
			isProcessing = false
		}
	}

	async function uploadSingleTask(task: UploadTask) {
		try {
			const cloudfs = (window as any).dweb?.cloudfs
			if (!cloudfs?.uploadToPublicUrl) {
				throw new Error('cloudfs.uploadToPublicUrl not available')
			}

			const arrayBuffer = await task.file.arrayBuffer()

			task.progress = 10

			const result = await cloudfs.uploadToPublicUrl({
				data: arrayBuffer,
				name: task.name,
				prefix: task.prefix,
				mimeType: task.file.type || 'application/octet-stream'
			})

			if (result?.ok) {
				task.progress = 100
				task.status = 'completed'
				task.publicUrl = result.publicUrl
				task.key = result.key
			} else {
				throw new Error(result?.error || 'Upload failed')
			}
		} catch (err: any) {
			task.status = 'error'
			task.error = err?.message || String(err)
			task.progress = 0
		} finally {
			void processQueue()
		}
	}

	function retryTask(taskId: string) {
		const task = tasks.value.find((t) => t.id === taskId)
		if (task && task.status === 'error') {
			task.status = 'pending'
			task.error = undefined
			task.progress = 0
			void processQueue()
		}
	}

	function removeTask(taskId: string) {
		const index = tasks.value.findIndex((t) => t.id === taskId)
		if (index !== -1) {
			tasks.value.splice(index, 1)
		}
	}

	function clearCompleted() {
		tasks.value = tasks.value.filter(
			(t) => t.status === 'pending' || t.status === 'uploading' || t.status === 'error'
		)
	}

	function clearAll() {
		tasks.value = []
	}

	function formatSize(bytes: number): string {
		if (!bytes || bytes <= 0) return '0 B'
		const units = ['B', 'KB', 'MB', 'GB']
		const i = Math.floor(Math.log(bytes) / Math.log(1024))
		return `${(bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)} ${units[i]}`
	}

	return {
		tasks,
		activeCount,
		pendingCount,
		completedCount,
		errorCount,
		totalCount,
		overallProgress,
		isActive,
		hasCompleted,
		hasErrors,
		isAllDone,
		addFiles,
		retryTask,
		removeTask,
		clearCompleted,
		clearAll,
		formatSize
	}
}

export function useUploadQueue() {
	if (!queueInstance) {
		queueInstance = createUploadQueue()
	}
	return queueInstance
}
