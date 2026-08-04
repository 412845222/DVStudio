export class Vector2 {
	x: number
	y: number

	constructor(x = 0, y = 0) {
		this.x = x
		this.y = y
	}

	set(x: number, y: number): this {
		this.x = x
		this.y = y
		return this
	}

	clone(): Vector2 {
		return new Vector2(this.x, this.y)
	}

	copy(v: Vector2): this {
		this.x = v.x
		this.y = v.y
		return this
	}

	add(v: Vector2): Vector2 {
		return new Vector2(this.x + v.x, this.y + v.y)
	}

	addScalar(s: number): Vector2 {
		return new Vector2(this.x + s, this.y + s)
	}

	sub(v: Vector2): Vector2 {
		return new Vector2(this.x - v.x, this.y - v.y)
	}

	subScalar(s: number): Vector2 {
		return new Vector2(this.x - s, this.y - s)
	}

	mul(s: number): Vector2 {
		return new Vector2(this.x * s, this.y * s)
	}

	mulV(v: Vector2): Vector2 {
		return new Vector2(this.x * v.x, this.y * v.y)
	}

	div(s: number): Vector2 {
		return s !== 0 ? new Vector2(this.x / s, this.y / s) : new Vector2(0, 0)
	}

	divV(v: Vector2): Vector2 {
		return new Vector2(v.x !== 0 ? this.x / v.x : 0, v.y !== 0 ? this.y / v.y : 0)
	}

	dot(v: Vector2): number {
		return this.x * v.x + this.y * v.y
	}

	cross(v: Vector2): number {
		return this.x * v.y - this.y * v.x
	}

	length(): number {
		return Math.sqrt(this.x * this.x + this.y * this.y)
	}

	lengthSq(): number {
		return this.x * this.x + this.y * this.y
	}

	normalize(): Vector2 {
		const len = this.length()
		return len > 0 ? this.mul(1 / len) : new Vector2(0, 0)
	}

	distanceTo(v: Vector2): number {
		return this.sub(v).length()
	}

	distanceToSq(v: Vector2): number {
		return this.sub(v).lengthSq()
	}

	lerp(v: Vector2, t: number): Vector2 {
		return new Vector2(this.x + (v.x - this.x) * t, this.y + (v.y - this.y) * t)
	}

	negate(): Vector2 {
		return new Vector2(-this.x, -this.y)
	}

	rotate(angle: number): Vector2 {
		const cos = Math.cos(angle)
		const sin = Math.sin(angle)
		return new Vector2(this.x * cos - this.y * sin, this.x * sin + this.y * cos)
	}

	angle(): number {
		return Math.atan2(this.y, this.x)
	}

	angleTo(v: Vector2): number {
		return Math.atan2(this.cross(v), this.dot(v))
	}

	equals(v: Vector2, epsilon = 1e-6): boolean {
		return Math.abs(this.x - v.x) < epsilon && Math.abs(this.y - v.y) < epsilon
	}

	toArray(): [number, number] {
		return [this.x, this.y]
	}

	toString(): string {
		return `Vector2(${this.x.toFixed(2)}, ${this.y.toFixed(2)})`
	}

	static zero(): Vector2 {
		return new Vector2(0, 0)
	}

	static one(): Vector2 {
		return new Vector2(1, 1)
	}

	static up(): Vector2 {
		return new Vector2(0, -1)
	}

	static down(): Vector2 {
		return new Vector2(0, 1)
	}

	static left(): Vector2 {
		return new Vector2(-1, 0)
	}

	static right(): Vector2 {
		return new Vector2(1, 0)
	}

	static fromArray(arr: [number, number]): Vector2 {
		return new Vector2(arr[0], arr[1])
	}

	static min(a: Vector2, b: Vector2): Vector2 {
		return new Vector2(Math.min(a.x, b.x), Math.min(a.y, b.y))
	}

	static max(a: Vector2, b: Vector2): Vector2 {
		return new Vector2(Math.max(a.x, b.x), Math.max(a.y, b.y))
	}
}
