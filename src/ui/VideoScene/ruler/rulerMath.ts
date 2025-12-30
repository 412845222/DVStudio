export const pickRulerStep = (zoom: number) => {
  // 目标：主刻度间距在屏幕上约 60px 以上
  const steps = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000]
  const targetPx = 60
  for (const step of steps) {
    if (step * zoom >= targetPx) return step
  }
  return steps[steps.length - 1]
}

export const floorToStep = (value: number, step: number) => Math.floor(value / step) * step
