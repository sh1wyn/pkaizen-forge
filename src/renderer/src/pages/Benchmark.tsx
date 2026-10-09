import { useEffect, useRef, useState } from 'react'
import type { DiskBenchResult } from '../../../shared/types'
import { useI18n } from '../lib/i18n'
import { useToast } from '../components/Toast'
import { benchmarkThreads, runCpuWorkers, runGpuBench } from '../lib/benchmark'

interface BenchRun {
  date: string
  cpuSingle: number
  cpuMulti: number
  writeMBps: number
  readMBps: number
  gpuFps: number | null
  threads: number
  renderer: string
  score: number
}

const HISTORY_KEY = 'pkaizen-bench-history-v2'

function validRun(value: unknown): value is BenchRun {
  if (!value || typeof value !== 'object') return false
  const run = value as BenchRun
  return typeof run.date === 'string' && typeof run.renderer === 'string' &&
    [run.cpuSingle, run.cpuMulti, run.writeMBps, run.readMBps, run.score, run.threads]
      .every((number) => Number.isFinite(number) && number >= 0) &&
    (run.gpuFps === null || (Number.isFinite(run.gpuFps) && run.gpuFps >= 0))
}

export default function Benchmark(): React.JSX.Element {
  const { t } = useI18n()
  const [phase, setPhase] = useState<'idle' | 'cpu1' | 'cpuN' | 'disk' | 'gpu'>('idle')
  const [gpuName, setGpuName] = useState('')
  const [result, setResult] = useState<BenchRun | null>(null)
  const [history, setHistory] = useState<BenchRun[]>([])
  const controller = useRef<AbortController | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [canvasKey, setCanvasKey] = useState(0)
  const toast = useToast()

  useEffect(() => {
    try {
      const saved: unknown = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]')
      setHistory(Array.isArray(saved) ? saved.filter(validRun).slice(0, 10) : [])
    } catch {
      setHistory([])
    }
    const cancelWhenHidden = (): void => {
      if (document.hidden) controller.current?.abort()
    }
    document.addEventListener('visibilitychange', cancelWhenHidden)
    return () => {
      document.removeEventListener('visibilitychange', cancelWhenHidden)
      controller.current?.abort()
    }
  }, [])

  const run = async (): Promise<void> => {
    if (controller.current) return
    const current = new AbortController()
    controller.current = current
    const { signal } = current
    const cancelDisk = (): void => { void window.api.cancelDiskBench().catch(() => undefined) }
    signal.addEventListener('abort', cancelDisk, { once: true })
    try {
      setResult(null)
      setGpuName('')
      setCanvasKey((key) => key + 1)
      setPhase('cpu1')
      const cpuSingle = await runCpuWorkers(1, signal)
      signal.throwIfAborted()
      setPhase('cpuN')
      const threads = benchmarkThreads(navigator.hardwareConcurrency || 2)
      const cpuMulti = await runCpuWorkers(threads, signal)
      signal.throwIfAborted()
      setPhase('disk')
      const disk: DiskBenchResult = await window.api.diskBench()
      signal.throwIfAborted()
      setPhase('gpu')
      const canvas = canvasRef.current
      if (!canvas) throw new Error('Benchmark canvas unavailable')
      canvas.width = 800
      canvas.height = 500
      const gpu = await runGpuBench(canvas, signal)
      signal.throwIfAborted()
      const gpuFps = gpu.fps
      setGpuName(gpu.renderer)

      const score = Math.round(cpuSingle * 2 + cpuMulti)
      const runData: BenchRun = {
        date: new Date().toLocaleString(),
        threads,
        renderer: gpu.renderer,
        cpuSingle,
        cpuMulti,
        writeMBps: disk.writeMBps,
        readMBps: disk.readMBps,
        gpuFps,
        score
      }
      setResult(runData)
      const newHistory = [runData, ...history].slice(0, 10)
      setHistory(newHistory)
      try { localStorage.setItem(HISTORY_KEY, JSON.stringify(newHistory)) } catch { /* storage unavailable */ }
      toast(t('bench.done'), 'success')
    } catch {
      if (!signal.aborted) toast(t('bench.error'), 'error')
    } finally {
      signal.removeEventListener('abort', cancelDisk)
      controller.current = null
      setPhase('idle')
    }
  }

  const prev = history.length > 1 && result ? history[1] : null
  const delta = prev && result && prev.score > 0 && prev.threads === result.threads
    ? Math.round(((result.score - prev.score) / prev.score) * 100) : null

  const PHASE_LABEL: Record<string, string> = {
    cpu1: t('bench.cpu1'),
    cpuN: t('bench.cpuMulti'),
    disk: t('bench.disk'),
    gpu: t('bench.gpu')
  }

  return (
    <>
      <h1>{t('bench.title')}</h1>
      <p className="subtitle">{t('bench.method')}</p>

      <div className="toolbar">
        <button className="btn primary" disabled={phase !== 'idle'} onClick={run}>
          {phase !== 'idle' ? <span className="spinner" /> : '🧪'} {t('bench.run')}
        </button>
        {phase !== 'idle' && (
          <button className="btn" onClick={() => controller.current?.abort()}>{t('bench.cancel')}</button>
        )}
        {phase !== 'idle' && <span className="muted">{PHASE_LABEL[phase]}</span>}
      </div>

      <div className="toolbar">
        {[
          ['Cinebench', 'https://www.maxon.net/en/downloads/cinebench'],
          ['3DMark', 'https://benchmarks.ul.com/3dmark'],
          ['CrystalDiskMark', 'https://crystalmark.info/en/software/crystaldiskmark/']
        ].map(([name, url]) => (
          <button className="btn" key={name} onClick={() => void window.api.openExternal(url)}>{name}</button>
        ))}
      </div>

      <canvas key={canvasKey} ref={canvasRef} id="bench-canvas" style={{ display: phase === 'gpu' ? 'block' : 'none', width: '100%', maxWidth: 400, aspectRatio: '8 / 5', borderRadius: 8 }} />

      {result && (
        <>
          <div className="card" style={{ marginBottom: 14 }}>
            <div className="score-ring">
              <div className="score-num">{result.score}</div>
              <div style={{ flex: 1 }}>
                <div className="big">{t('bench.cpuIndex')}</div>
                <div className="sub">
                  {delta != null
                    ? delta > 0
                      ? t('bench.betterPrev', delta)
                      : delta < 0
                        ? t('bench.worsePrev', delta)
                        : t('bench.samePrev')
                    : t('bench.firstRun')}
                </div>
              </div>
            </div>
          </div>
          <div className="grid">
            <div className="card stagger">
              <h3>{t('bench.cpuSingle')}</h3>
              <div className="big">{result.cpuSingle} pts</div>
            </div>
            <div className="card stagger">
              <h3>{t('bench.cpuMulti')}</h3>
              <div className="big">{result.cpuMulti} pts</div>
              <div className="sub">{result.threads} {t('bench.threadsUsed')}</div>
            </div>
            <div className="card stagger">
              <h3>{t('bench.write')}</h3>
              <div className="big">{result.writeMBps} MiB/s</div>
            </div>
            <div className="card stagger">
              <h3>{t('bench.read')}</h3>
              <div className="big">{result.readMBps} MiB/s</div>
              <div className="sub">{t('bench.cachedRead')}</div>
            </div>
            <div className="card stagger">
              <h3>{t('bench.gpuRender')}</h3>
              <div className="big">{result.gpuFps == null ? t('bench.unavailable') : `${result.gpuFps} FPS`}</div>
              <div className="sub">
                {t('bench.gpuLimited')}
                {gpuName && (
                  <>
                    <br />
                    <span style={{ opacity: 0.7 }}>{t('bench.renderedOn')} {gpuName}</span>
                  </>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {history.length > 0 && (
        <>
          <div className="section-title">{t('bench.history')}</div>
          <table>
            <thead>
              <tr>
                <th>{t('bench.date')}</th>
                <th>{t('bench.cpuIndex')}</th>
                <th>CPU 1c</th>
                <th>CPU multi</th>
                <th>{t('bench.write')}</th>
                <th>{t('bench.read')}</th>
                <th>GPU</th>
              </tr>
            </thead>
            <tbody>
              {history.map((h, i) => (
                <tr key={i}>
                  <td className="muted">{h.date}</td>
                  <td>
                    <b>{h.score}</b>
                  </td>
                  <td>{h.cpuSingle}</td>
                  <td>{h.cpuMulti}</td>
                  <td>{h.writeMBps} MiB/s</td>
                  <td>{h.readMBps} MiB/s</td>
                  <td>{h.gpuFps == null ? t('bench.unavailable') : `${h.gpuFps} FPS`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </>
  )
}
