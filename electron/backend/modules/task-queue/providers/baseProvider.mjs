export class BaseTaskProvider {
	constructor(name) {
		this.name = name
	}

	async submit(_task, _input) {
		return { ok: false, error: 'submit not implemented' }
	}

	async poll(_task) {
		return { ok: false, error: 'poll not implemented' }
	}

	async cancel(_task) {
		return { ok: true }
	}
}
