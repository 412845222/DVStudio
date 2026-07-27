import { Vector2 } from '../core/Vector2'
import { Matrix3 } from '../core/Matrix3'

export class Transform {
	position: Vector2
	rotation: number
	scale: Vector2
	anchor: Vector2

	private localMatrix: Matrix3
	private worldMatrix: Matrix3
	private dirty: boolean

	constructor() {
		this.position = new Vector2(0, 0)
		this.rotation = 0
		this.scale = new Vector2(1, 1)
		this.anchor = new Vector2(0, 0)
		this.localMatrix = new Matrix3()
		this.worldMatrix = new Matrix3()
		this.dirty = true
	}

	markDirty(): void {
		this.dirty = true
	}

	isDirty(): boolean {
		return this.dirty
	}

	setPosition(x: number, y: number): this {
		this.position.set(x, y)
		this.dirty = true
		return this
	}

	setRotation(angle: number): this {
		this.rotation = angle
		this.dirty = true
		return this
	}

	setScale(sx: number, sy?: number): this {
		this.scale.set(sx, sy ?? sx)
		this.dirty = true
		return this
	}

	setAnchor(x: number, y: number): this {
		this.anchor.set(x, y)
		this.dirty = true
		return this
	}

	translate(dx: number, dy: number): this {
		this.position.x += dx
		this.position.y += dy
		this.dirty = true
		return this
	}

	getLocalMatrix(): Matrix3 {
		if (this.dirty) {
			this.updateLocalMatrix()
		}
		return this.localMatrix
	}

	private updateLocalMatrix(): void {
		this.localMatrix.identity()
		this.localMatrix.translate(this.position.x, this.position.y)
		this.localMatrix.rotate(this.rotation)
		this.localMatrix.scale(this.scale.x, this.scale.y)
		this.localMatrix.translate(-this.anchor.x, -this.anchor.y)
		this.dirty = false
	}

	getWorldMatrix(parentMatrix?: Matrix3): Matrix3 {
		const local = this.getLocalMatrix()
		if (parentMatrix) {
			this.worldMatrix.copy(parentMatrix).multiply(local)
		} else {
			this.worldMatrix.copy(local)
		}
		return this.worldMatrix
	}

	localToWorld(local: Vector2, parentMatrix?: Matrix3): Vector2 {
		return this.getWorldMatrix(parentMatrix).transformPoint(local)
	}

	worldToLocal(world: Vector2, parentMatrix?: Matrix3): Vector2 {
		const worldInv = this.getWorldMatrix(parentMatrix).clone().invert()
		return worldInv.transformPoint(world)
	}

	clone(): Transform {
		const t = new Transform()
		t.position.copy(this.position)
		t.rotation = this.rotation
		t.scale.copy(this.scale)
		t.anchor.copy(this.anchor)
		return t
	}
}
