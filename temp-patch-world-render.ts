		// Check for image child of rounded rect parent - use mask rendering
		if (n.type === 'image' && n.parentId) {
			const parent = this.nodesById.get(n.parentId)
			if (parent && parent.type === 'rect') {
				const cornerRadius = Number(parent.props?.cornerRadius ?? 0)
				// Apply mask to clip image to parent bounds (even when cornerRadius is 0)
				const imageSrc = String(n.props?.imageSrc ?? '')
				const wrap = ((n.props as any)?.repeat ? 'repeat' : 'clamp') as 'repeat' | 'clamp'
				if (imageSrc) {
					const tex = canvas.getImageTexture(imageSrc, wrap)
					if (tex) {
						const nodeW = Math.max(1, Number(n.transform.width ?? 1))
						const nodeH = Math.max(1, Number(n.transform.height ?? 1))
						const parentW = Math.max(1, Number(parent.transform.width ?? 1))
						const parentH = Math.max(1, Number(parent.transform.height ?? 1))
						const c = this.getPivotCenter(n.transform as any)
						const parentC = this.getPivotCenter(parent.transform as any)
						canvas.drawTexturedRectWithRoundedMask(
							c.cx,
							c.cy,
							nodeW,
							nodeH,
							tex,
							opacity,
							rotation,
							parentC.cx,
							parentC.cy,
							parentW,
							parentH,
							cornerRadius
						)
						continue
					}
				}
			}
		}

		this.getRenderer(n.type).renderWorld(canvas, n, { opacity, rotation })