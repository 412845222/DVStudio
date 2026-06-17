import { computed, ref, type Ref } from 'vue'

type PerfFrameSample = { time: number; dt: number; dropped: number }
type PerfLongTaskSample = { time: number; duration: number }
type PerfDiagnosticSample = {
  time: number
  fps: number
  frameMs: number
  avgFrameMs: number
  worstFrameMs: number
  droppedFrames: number
  slowFrames: number
  longTaskCount: number
  longTaskDuration: number
  nodes: number
  visibleNodes: number
  compactNodes: number
  fullNodes: number
  edges: number
  renderEdges: number
  zoom: number
  edgeComputeMs: number
  edgeInputCount?: number
  edgeRenderedCount?: number
  edgeCulledCount?: number
}
type PerfAnomalySample = {
  time: number
  reason: 'low-fps-streak' | 'longtask'
  detail: string
}

export const useAIWorkflowPerfMonitor = (payload: {
  nodesCount: Ref<number>
  visibleNodesCount: Ref<number>
  compactVisibleNodeCount: Ref<number>
  fullVisibleNodeCount: Ref<number>
  renderEdgesCount: Ref<number>
  edgesCount: Ref<number>
  zoom: Ref<number>
  edgeComputeMs: Ref<number>
  edgeInputCount?: Ref<number>
  edgeRenderedCount?: Ref<number>
  edgeCulledCount?: Ref<number>
}) => {
  const perfPanelCollapsed = ref(true)
  const perfFps = ref(0)
  const perfFrameMs = ref(0)
  const perfAvgFrameMs = ref(0)
  const perfWorstFrameMs = ref(0)
  const perfDroppedFrames = ref(0)
  const perfSlowFrames = ref(0)
  const perfLongTaskCount = ref(0)
  const perfLongTaskDuration = ref(0)
  const perfLastLongTaskMs = ref(0)
  const perfAnomalyCount = ref(0)
  const perfAnomalyLatestDetail = ref('')
  const perfFrames: PerfFrameSample[] = []
  const perfLongTasks: PerfLongTaskSample[] = []
  const perfDiagnosticSamples: PerfDiagnosticSample[] = []
  const perfAnomalies: PerfAnomalySample[] = []

  const PERF_FRAME_WINDOW_MS = 2000
  const PERF_LONGTASK_WINDOW_MS = 10000
  const PERF_DIAG_WINDOW_MS = 60000
  const PERF_DIAG_SAMPLE_INTERVAL_MS = 1000
  const PERF_STATE_COMMIT_INTERVAL_MS = 800
  const PERF_MONITOR_TICK_MS = 500
  const PERF_ANOMALY_COOLDOWN_MS = 2500
  const PERF_LOW_FPS_THRESHOLD = 20
  const PERF_LOW_FPS_STREAK_THRESHOLD = 3
  const PERF_LONGTASK_ALERT_THRESHOLD_MS = 100
  const ENABLE_LONGTASK_OBSERVER = false
  let perfStopped = false
  let perfTimer: number | null = null
  let perfLastTs = 0
  let perfLastDiagSampleTs = 0
  let perfLowFpsStreak = 0
  let perfLastAnomalyTs = 0
  let perfLastStateCommitTs = 0
  let perfLongTaskObserver: PerformanceObserver | null = null
  let perfPauseByVisibility = false

  const onDocumentVisibilityChange = () => {
    if (typeof document === 'undefined') return
    if (document.visibilityState === 'hidden') {
      perfPauseByVisibility = true
      if (perfTimer != null) window.clearInterval(perfTimer)
      perfTimer = null
      perfLastTs = 0
      return
    }
    if (perfPauseByVisibility && !perfStopped && perfTimer == null) {
      perfPauseByVisibility = false
      perfTimer = window.setInterval(onPerfTick, PERF_MONITOR_TICK_MS)
    }
  }

  const recordPerfAnomaly = (
    now: number,
    reason: 'low-fps-streak' | 'longtask',
    detail: string,
    opts?: { force?: boolean }
  ) => {
    if (!opts?.force && now - perfLastAnomalyTs < PERF_ANOMALY_COOLDOWN_MS) return
    perfLastAnomalyTs = now
    perfAnomalies.push({ time: now, reason, detail })
    if (perfAnomalies.length > 80) perfAnomalies.splice(0, perfAnomalies.length - 80)
    perfAnomalyCount.value = perfAnomalies.length
    perfAnomalyLatestDetail.value = detail
  }

  const prunePerfSamples = (now: number) => {
    const frameCutoff = now - PERF_FRAME_WINDOW_MS
    if (perfFrames.length) {
      const firstValidIndex = perfFrames.findIndex((sample) => sample.time >= frameCutoff)
      if (firstValidIndex > 0) {
        perfFrames.splice(0, firstValidIndex)
      } else if (firstValidIndex < 0) {
        perfFrames.length = 0
      }
    }
    const longTaskCutoff = now - PERF_LONGTASK_WINDOW_MS
    if (perfLongTasks.length) {
      const firstValidIndex = perfLongTasks.findIndex((sample) => sample.time >= longTaskCutoff)
      if (firstValidIndex > 0) {
        perfLongTasks.splice(0, firstValidIndex)
      } else if (firstValidIndex < 0) {
        perfLongTasks.length = 0
      }
    }
    const diagCutoff = now - PERF_DIAG_WINDOW_MS
    if (perfDiagnosticSamples.length) {
      const firstValidIndex = perfDiagnosticSamples.findIndex((sample) => sample.time >= diagCutoff)
      if (firstValidIndex > 0) {
        perfDiagnosticSamples.splice(0, firstValidIndex)
      } else if (firstValidIndex < 0) {
        perfDiagnosticSamples.length = 0
      }
    }
    if (perfAnomalies.length) {
      const firstValidIndex = perfAnomalies.findIndex((sample) => sample.time >= diagCutoff)
      if (firstValidIndex > 0) {
        perfAnomalies.splice(0, firstValidIndex)
      } else if (firstValidIndex < 0) {
        perfAnomalies.length = 0
      }
      perfAnomalyCount.value = perfAnomalies.length
      perfAnomalyLatestDetail.value = perfAnomalies.length
        ? perfAnomalies[perfAnomalies.length - 1]!.detail
        : ''
    }
  }

  const samplePerfDiagnosticIfNeeded = (now: number) => {
    if (now - perfLastDiagSampleTs < PERF_DIAG_SAMPLE_INTERVAL_MS) return
    perfLastDiagSampleTs = now
    const zoom = Number(payload.zoom.value) || 0
    const edgeComputeMs = Number(payload.edgeComputeMs.value) || 0
    const edgeInputCount = Number(payload.edgeInputCount?.value) || 0
    const edgeRenderedCount = Number(payload.edgeRenderedCount?.value) || 0
    const edgeCulledCount = Number(payload.edgeCulledCount?.value) || 0
    perfDiagnosticSamples.push({
      time: now,
      fps: perfFps.value,
      frameMs: perfFrameMs.value,
      avgFrameMs: perfAvgFrameMs.value,
      worstFrameMs: perfWorstFrameMs.value,
      droppedFrames: perfDroppedFrames.value,
      slowFrames: perfSlowFrames.value,
      longTaskCount: perfLongTaskCount.value,
      longTaskDuration: perfLongTaskDuration.value,
      nodes: payload.nodesCount.value,
      visibleNodes: payload.visibleNodesCount.value,
      compactNodes: payload.compactVisibleNodeCount.value,
      fullNodes: payload.fullVisibleNodeCount.value,
      edges: payload.edgesCount.value,
      renderEdges: payload.renderEdgesCount.value,
      zoom,
      edgeComputeMs,
      edgeInputCount,
      edgeRenderedCount,
      edgeCulledCount,
    })
    if (perfDiagnosticSamples.length > 360) {
      perfDiagnosticSamples.splice(0, perfDiagnosticSamples.length - 360)
    }
  }

  const recomputePerfState = (now: number) => {
    prunePerfSamples(now)
    const frames = perfFrames
    if (!frames.length) {
      perfFps.value = 0
      perfFrameMs.value = 0
      perfAvgFrameMs.value = 0
      perfWorstFrameMs.value = 0
      perfDroppedFrames.value = 0
      perfSlowFrames.value = 0
    } else {
      const total = frames.reduce((sum, sample) => sum + sample.dt, 0)
      const worst = frames.reduce((max, sample) => Math.max(max, sample.dt), 0)
      const dropped = frames.reduce((sum, sample) => sum + sample.dropped, 0)
      const slow = frames.filter((sample) => sample.dt >= 34).length
      perfFrameMs.value = frames[frames.length - 1]?.dt ?? 0
      perfAvgFrameMs.value = total / frames.length
      perfWorstFrameMs.value = worst
      perfDroppedFrames.value = dropped
      perfSlowFrames.value = slow
      perfFps.value = total > 0 ? (frames.length * 1000) / total : 0
    }

    const longTasks = perfLongTasks
    perfLongTaskCount.value = longTasks.length
    perfLongTaskDuration.value = longTasks.reduce((sum, sample) => sum + sample.duration, 0)
    perfLastLongTaskMs.value = longTasks.length ? longTasks[longTasks.length - 1]!.duration : 0
    samplePerfDiagnosticIfNeeded(now)
  }

  const onPerfTick = () => {
    if (perfStopped) return
    try {
      const ts = performance.now()
      if (perfLastTs > 0) {
        const dt = ts - perfLastTs
        const instantFps = dt > 0 ? 1000 / dt : 60
        perfLowFpsStreak = instantFps < PERF_LOW_FPS_THRESHOLD ? perfLowFpsStreak + 1 : 0
        if (perfLowFpsStreak >= PERF_LOW_FPS_STREAK_THRESHOLD) {
          recordPerfAnomaly(ts, 'low-fps-streak', `连续 ${perfLowFpsStreak} 帧低于 ${PERF_LOW_FPS_THRESHOLD} FPS`)
        }
        const dropped = Math.max(0, Math.round(dt / 16.67) - 1)
        perfFrames.push({ time: ts, dt, dropped })
        if (perfFrames.length > 240) perfFrames.splice(0, perfFrames.length - 240)
        if (ts - perfLastStateCommitTs >= PERF_STATE_COMMIT_INTERVAL_MS) {
          recomputePerfState(ts)
          perfLastStateCommitTs = ts
        }
      }
      perfLastTs = ts
    } catch {
      stopPerfMonitor()
    }
  }

  const startPerfMonitor = () => {
    perfStopped = false
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onDocumentVisibilityChange)
      if (document.visibilityState === 'hidden') {
        perfPauseByVisibility = true
        return
      }
    }
    if (perfTimer == null) perfTimer = window.setInterval(onPerfTick, PERF_MONITOR_TICK_MS)
    if (ENABLE_LONGTASK_OBSERVER && typeof window !== 'undefined' && 'PerformanceObserver' in window) {
      const PerfObserver = (window as any).PerformanceObserver as typeof PerformanceObserver | undefined
      const supported = typeof PerfObserver?.supportedEntryTypes !== 'undefined'
        ? PerfObserver!.supportedEntryTypes.includes('longtask')
        : false
      if (!perfLongTaskObserver && supported && PerfObserver) {
        perfLongTaskObserver = new PerfObserver((list) => {
          try {
            const now = performance.now()
            const entries = list.getEntries()
            const nextSamples = entries.map((entry) => ({ time: now, duration: entry.duration }))
            for (const entry of entries) {
              if (entry.duration >= PERF_LONGTASK_ALERT_THRESHOLD_MS) {
                recordPerfAnomaly(
                  now,
                  'longtask',
                  `长任务 ${entry.duration.toFixed(1)} ms`
                )
              }
            }
            perfLongTasks.push(...nextSamples)
            if (perfLongTasks.length > 160) perfLongTasks.splice(0, perfLongTasks.length - 160)
            if (now - perfLastStateCommitTs >= PERF_STATE_COMMIT_INTERVAL_MS) {
              recomputePerfState(now)
              perfLastStateCommitTs = now
            }
          } catch {
            stopPerfMonitor()
          }
        })
        perfLongTaskObserver.observe({ entryTypes: ['longtask'] })
      }
    }
  }

  const stopPerfMonitor = () => {
    perfStopped = true
    if (perfTimer != null) window.clearInterval(perfTimer)
    perfTimer = null
    perfLastTs = 0
    perfLastDiagSampleTs = 0
    perfLowFpsStreak = 0
    perfLastStateCommitTs = 0
    perfPauseByVisibility = false
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', onDocumentVisibilityChange)
    }
    perfLongTaskObserver?.disconnect()
    perfLongTaskObserver = null
  }

  const perfHealthLabel = computed(() => {
    if (perfFps.value >= 55 && perfSlowFrames.value <= 2) return '稳定'
    if (perfFps.value >= 40 && perfSlowFrames.value <= 6) return '轻微掉帧'
    return '明显掉帧'
  })

  const perfHealthClass = computed(() => {
    if (perfHealthLabel.value === '稳定') return 'is-good'
    if (perfHealthLabel.value === '轻微掉帧') return 'is-warn'
    return 'is-bad'
  })

  const perfFpsText = computed(() => (perfFps.value > 0 ? `${Math.round(perfFps.value)}` : '--'))
  const perfFrameText = computed(() => (perfFrameMs.value > 0 ? `${perfFrameMs.value.toFixed(1)} ms` : '--'))
  const perfAvgFrameText = computed(() => (perfAvgFrameMs.value > 0 ? `${perfAvgFrameMs.value.toFixed(1)} ms` : '--'))
  const perfWorstFrameText = computed(() => (perfWorstFrameMs.value > 0 ? `${perfWorstFrameMs.value.toFixed(1)} ms` : '--'))
  const perfLongTaskSummary = computed(() => {
    if (!perfLongTaskCount.value) return '0 次'
    return `${perfLongTaskCount.value} 次 / ${perfLongTaskDuration.value.toFixed(0)} ms`
  })
  const perfAnomalySummary = computed(() => {
    if (!perfAnomalyCount.value) return '0 次'
    return `${perfAnomalyCount.value} 次 / ${perfAnomalyLatestDetail.value || '--'}`
  })

  const perfNodeSummary = computed(() => `${payload.nodesCount.value} 总 / ${payload.visibleNodesCount.value} 可见 / ${payload.compactVisibleNodeCount.value} 轻量 / ${payload.fullVisibleNodeCount.value} 完整`)
  const perfEdgeSummary = computed(() => `${payload.renderEdgesCount.value} 可见 / ${payload.edgesCount.value} 总`)
  const perfEdgeComputeText = computed(() => (payload.edgeComputeMs.value > 0 ? `${payload.edgeComputeMs.value.toFixed(2)} ms` : '--'))
  const perfEdgeInputCountText = computed(() => `${Number(payload.edgeInputCount?.value ?? 0)} 条`)
  const perfEdgeRenderedText = computed(() => `${Number(payload.edgeRenderedCount?.value ?? 0)} 条`)
  const perfEdgeCulledText = computed(() => `${Number(payload.edgeCulledCount?.value ?? 0)} 条`)
  const perfEdgeCullHitRateText = computed(() => {
    const input = Number(payload.edgeInputCount?.value ?? 0)
    const culled = Number(payload.edgeCulledCount?.value ?? 0)
    if (!input) return '-- %'
    return `${((culled / input) * 100).toFixed(1)}%`
  })
  const perfZoomText = computed(() => `${(Number(payload.zoom.value) || 0).toFixed(2)}x`)

  const buildPerfDiagnosticPayload = () => {
    const now = Date.now()
    return {
      schemaVersion: 1,
      generatedAt: now,
      thresholds: {
        lowFps: PERF_LOW_FPS_THRESHOLD,
        lowFpsStreak: PERF_LOW_FPS_STREAK_THRESHOLD,
        longTaskMs: PERF_LONGTASK_ALERT_THRESHOLD_MS,
      },
      windows: {
        frameWindowMs: PERF_FRAME_WINDOW_MS,
        longTaskWindowMs: PERF_LONGTASK_WINDOW_MS,
        diagnosticsWindowMs: PERF_DIAG_WINDOW_MS,
      },
      current: {
        fps: perfFps.value,
        frameMs: perfFrameMs.value,
        avgFrameMs: perfAvgFrameMs.value,
        worstFrameMs: perfWorstFrameMs.value,
        droppedFrames: perfDroppedFrames.value,
        slowFrames: perfSlowFrames.value,
        longTaskCount: perfLongTaskCount.value,
        longTaskDuration: perfLongTaskDuration.value,
        zoom: Number(payload.zoom.value) || 0,
        nodes: payload.nodesCount.value,
        visibleNodes: payload.visibleNodesCount.value,
        compactNodes: payload.compactVisibleNodeCount.value,
        fullNodes: payload.fullVisibleNodeCount.value,
        edges: payload.edgesCount.value,
        renderEdges: payload.renderEdgesCount.value,
        edgeComputeMs: Number(payload.edgeComputeMs.value) || 0,
        edgeInputCount: Number(payload.edgeInputCount?.value) || 0,
        edgeRenderedCount: Number(payload.edgeRenderedCount?.value) || 0,
        edgeCulledCount: Number(payload.edgeCulledCount?.value) || 0,
      },
      diagnostics: {
        samples: perfDiagnosticSamples.slice(),
        anomalies: perfAnomalies.slice(),
      },
    }
  }

  return {
    perfPanelCollapsed,
    perfDroppedFrames,
    perfSlowFrames,
    perfHealthLabel,
    perfHealthClass,
    perfFpsText,
    perfFrameText,
    perfAvgFrameText,
    perfWorstFrameText,
    perfLongTaskSummary,
    perfAnomalySummary,
    perfNodeSummary,
    perfEdgeSummary,
    perfEdgeComputeText,
    perfEdgeInputCountText,
    perfEdgeRenderedText,
    perfEdgeCulledText,
    perfEdgeCullHitRateText,
    perfZoomText,
    buildPerfDiagnosticPayload,
    startPerfMonitor,
    stopPerfMonitor,
  }
}
