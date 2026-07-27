import { Vector2 } from './Vector2'
import { Rect } from './Rect'

export class Bounds {
	min: Vector2
	max: Vector2

	constructor(min?: Vector2, max?: Vector2) {
		this.min = min ? min.clone() : new Vector2(Infinity, Infinity)
		this.max = max ? max.clone() : new Vector2(-Infinity, -Infinity)
	}

	reset(): this {
		this.min.set(Infinity, Infinity)
		this.max.set(-Infinity, -Infinity)
		return this
	}

	isEmpty(): boolean {
		return this.min.x > this.max.x || this.min.y > this.max.y
	}

	get center(): Vector2 {
		return new Vector2((this.min.x + this.max.x) / 2, (this.min.y + this.max.y) / 2)
	}

	get size(): Vector2 {
		return new Vector2(this.max.x - this.min.x, this.max.y - this.min.y)
	}

	get rect(): Rect {
		if (this.isEmpty()) return Rect.empty()
		return new Rect(this.min.x, this.min.y, this.max.x - this.min.x, this.max.y - this.min.y)
	}

	addPoint(p: Vector2): this {
		if (p.x < this.min.x) this.min.x = p.x
		if (p.y < this.min.y) this.min.y = p.y
		if (p.x > this.max.x) this.max.x = p.x
		if (p.y > this.max.y) this.max.y = p.y
		return this
	}

	addPoints(points: Vector2[]): this {
		for (const p of points) {
			this.addPoint(p)
		}
		return this
	}

	addRect(r: Rect): this {
		this.addPoint(new Vector2(r.x, r.y))
		this.addPoint(new Vector2(r.right, r.bottom))
		return this
	}

	addBounds(b: Bounds): this {
		if (b.min.x < this.min.x) this.min.x = b.min.x
		if (b.min.y < this.min.y) this.min.y = b.min.y
		if (b.max.x > this.max.x) this.max.x = b.max.x
		if (b.max.y > this.max.y) this.max.y = b.max.y
		return this
	}

	containsPoint(p: Vector2): boolean {
		return p.x >= this.min.x && p.x <= this.max.x && p.y >= this.min.y && p.y <= this.max.y
	}

	intersects(b: Bounds): boolean {
		return !(
			b.min.x > this.max.x ||
			b.max.x < this.min.x ||
			b.min.y > this.max.y ||
			b.max.y < this.min.y
		)
	}

	static fromPoints(points: Vector2[]): Bounds {
		const b = new Bounds()
		b.addPoints(points)
		return b
	}

	static fromRect(r: Rect): Bounds {
		const b = new Bounds()
		b.addRect(r)
		return b
	}
}
