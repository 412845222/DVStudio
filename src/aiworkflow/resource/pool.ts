import type { WorkflowResource } from './types'

export abstract class WorkflowResourcePool {
	abstract add(resource: WorkflowResource): void
	abstract get(id: string): WorkflowResource | null
	abstract remove(id: string): void
	abstract list(): WorkflowResource[]
}
