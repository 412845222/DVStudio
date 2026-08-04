import { Vector2 } from './Vector2'

const EPSILON = 1e-6

export class Matrix3 {
	elements: Float32Array

	constructor() {
		this.elements = new Float32Array(9)
		this.identity()
	}

	identity(): Matrix3 {
		const e = this.elements
		e[0] = 1
		e[1] = 0
		e[2] = 0
		e[3] = 0
		e[4] = 1
		e[5] = 0
		e[6] = 0
		e[7] = 0
		e[8] = 1
		return this
	}

	clone(): Matrix3 {
		const m = new Matrix3()
		m.elements.set(this.elements)
		return m
	}

	copy(m: Matrix3): Matrix3 {
		this.elements.set(m.elements)
		return this
	}

	set(
		a1: number,
		a2: number,
		a3: number,
		b1: number,
		b2: number,
		b3: number,
		c1: number,
		c2: number,
		c3: number
	): Matrix3 {
		const e = this.elements
		e[0] = a1
		e[1] = b1
		e[2] = c1
		e[3] = a2
		e[4] = b2
		e[5] = c2
		e[6] = a3
		e[7] = b3
		e[8] = c3
		return this
	}

	multiply(m: Matrix3): Matrix3 {
		return this.multiplyMatrices(this, m)
	}

	premultiply(m: Matrix3): Matrix3 {
		return this.multiplyMatrices(m, this)
	}

	multiplyMatrices(a: Matrix3, b: Matrix3): Matrix3 {
		const ae = a.elements
		const be = b.elements
		const te = this.elements

		const a11 = ae[0],
			a12 = ae[3],
			a13 = ae[6]
		const a21 = ae[1],
			a22 = ae[4],
			a23 = ae[7]
		const a31 = ae[2],
			a32 = ae[5],
			a33 = ae[8]

		const b11 = be[0],
			b12 = be[3],
			b13 = be[6]
		const b21 = be[1],
			b22 = be[4],
			b23 = be[7]
		const b31 = be[2],
			b32 = be[5],
			b33 = be[8]

		te[0] = a11 * b11 + a12 * b21 + a13 * b31
		te[3] = a11 * b12 + a12 * b22 + a13 * b32
		te[6] = a11 * b13 + a12 * b23 + a13 * b33
		te[1] = a21 * b11 + a22 * b21 + a23 * b31
		te[4] = a21 * b12 + a22 * b22 + a23 * b32
		te[7] = a21 * b13 + a22 * b23 + a23 * b33
		te[2] = a31 * b11 + a32 * b21 + a33 * b31
		te[5] = a31 * b12 + a32 * b22 + a33 * b32
		te[8] = a31 * b13 + a32 * b23 + a33 * b33

		return this
	}

	translate(x: number, y: number): Matrix3 {
		return this.multiply(Matrix3.translation(x, y))
	}

	rotate(angle: number): Matrix3 {
		return this.multiply(Matrix3.rotation(angle))
	}

	scale(sx: number, sy: number): Matrix3 {
		return this.multiply(Matrix3.scaling(sx, sy))
	}

	invert(): Matrix3 {
		const e = this.elements
		const a11 = e[0],
			a12 = e[3],
			a13 = e[6]
		const a21 = e[1],
			a22 = e[4],
			a23 = e[7]
		const a31 = e[2],
			a32 = e[5],
			a33 = e[8]

		const t11 = a22 * a33 - a32 * a23
		const t12 = a32 * a13 - a12 * a33
		const t13 = a12 * a23 - a22 * a13
		const t21 = a31 * a23 - a21 * a33
		const t22 = a11 * a33 - a31 * a13
		const t23 = a21 * a13 - a11 * a23
		const t31 = a21 * a32 - a31 * a22
		const t32 = a31 * a12 - a11 * a32
		const t33 = a11 * a22 - a21 * a12

		let det = a11 * t11 + a12 * t21 + a13 * t31
		if (Math.abs(det) < EPSILON) {
			return this.identity()
		}
		det = 1.0 / det

		e[0] = t11 * det
		e[1] = t21 * det
		e[2] = t31 * det
		e[3] = t12 * det
		e[4] = t22 * det
		e[5] = t32 * det
		e[6] = t13 * det
		e[7] = t23 * det
		e[8] = t33 * det

		return this
	}

	determinant(): number {
		const e = this.elements
		const a11 = e[0],
			a12 = e[3],
			a13 = e[6]
		const a21 = e[1],
			a22 = e[4],
			a23 = e[7]
		const a31 = e[2],
			a32 = e[5],
			a33 = e[8]
		return (
			a11 * (a22 * a33 - a32 * a23) + a12 * (a31 * a23 - a21 * a33) + a13 * (a21 * a32 - a31 * a22)
		)
	}

	transpose(): Matrix3 {
		const e = this.elements
		let tmp: number
		tmp = e[1]
		e[1] = e[3]
		e[3] = tmp
		tmp = e[2]
		e[2] = e[6]
		e[6] = tmp
		tmp = e[5]
		e[5] = e[7]
		e[7] = tmp
		return this
	}

	transformPoint(v: Vector2): Vector2 {
		const e = this.elements
		const x = v.x,
			y = v.y
		const w = e[2] * x + e[5] * y + e[8]
		if (Math.abs(w - 1) > EPSILON) {
			return new Vector2((e[0] * x + e[3] * y + e[6]) / w, (e[1] * x + e[4] * y + e[7]) / w)
		}
		return new Vector2(e[0] * x + e[3] * y + e[6], e[1] * x + e[4] * y + e[7])
	}

	transformVector(v: Vector2): Vector2 {
		const e = this.elements
		return new Vector2(e[0] * v.x + e[3] * v.y, e[1] * v.x + e[4] * v.y)
	}

	decompose(): { translation: Vector2; rotation: number; scale: Vector2 } {
		const e = this.elements
		const translation = new Vector2(e[6], e[7])
		const sx = Math.sqrt(e[0] * e[0] + e[1] * e[1])
		const sy = Math.sqrt(e[3] * e[3] + e[4] * e[4])
		const rotation = Math.atan2(e[1], e[0])
		return {
			translation,
			rotation,
			scale: new Vector2(sx, sy)
		}
	}

	equals(m: Matrix3, epsilon = EPSILON): boolean {
		for (let i = 0; i < 9; i++) {
			if (Math.abs(this.elements[i] - m.elements[i]) > epsilon) return false
		}
		return true
	}

	static translation(x: number, y: number): Matrix3 {
		const m = new Matrix3()
		const e = m.elements
		e[0] = 1
		e[1] = 0
		e[2] = 0
		e[3] = 0
		e[4] = 1
		e[5] = 0
		e[6] = x
		e[7] = y
		e[8] = 1
		return m
	}

	static rotation(angle: number): Matrix3 {
		const c = Math.cos(angle)
		const s = Math.sin(angle)
		const m = new Matrix3()
		const e = m.elements
		e[0] = c
		e[1] = s
		e[2] = 0
		e[3] = -s
		e[4] = c
		e[5] = 0
		e[6] = 0
		e[7] = 0
		e[8] = 1
		return m
	}

	static scaling(sx: number, sy: number): Matrix3 {
		const m = new Matrix3()
		const e = m.elements
		e[0] = sx
		e[1] = 0
		e[2] = 0
		e[3] = 0
		e[4] = sy
		e[5] = 0
		e[6] = 0
		e[7] = 0
		e[8] = 1
		return m
	}

	static TRS(translation: Vector2, rotation: number, scale: Vector2): Matrix3 {
		return Matrix3.translation(translation.x, translation.y)
			.multiply(Matrix3.rotation(rotation))
			.multiply(Matrix3.scaling(scale.x, scale.y))
	}
}
