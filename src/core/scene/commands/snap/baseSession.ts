import type { SnapContext, SnapLock } from './types'

export abstract class SnapSessionBase<
	TSession extends { ctx: SnapContext; lock: SnapLock | null },
	TStepArgs,
	TResult extends { lock: SnapLock | null },
> {
	protected readonly ctx: SnapContext
	protected readonly lock: SnapLock | null

	protected constructor(session: TSession) {
		this.ctx = session.ctx
		this.lock = session.lock
	}

	protected abstract compute(args: TStepArgs): TResult

	public step(args: TStepArgs): { session: TSession; result: TResult } {
		const result = this.compute(args)
		return { session: { ctx: this.ctx, lock: result.lock } as TSession, result }
	}
}
