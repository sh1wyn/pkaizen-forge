import { useEffect, useRef, useState } from 'react'
import type { DiskBenchResult } from '../../../shared/types'
import { useI18n } from '../lib/i18n'
import { useToast } from '../components/Toast'
import { benchmarkThreads, runCpuWorkers, runGpuBench } from '../lib/benchmark'
import GamingOverview from '../components/GamingOverview'
import GameRecording from '../components/GameRecording'

interface BenchRun {
  date: string
  cpuSingle: number
  cpuMulti: number
  writeMBps: number
  readMBps: number
  gpuFps: number | null
  gpuMs?: number | null
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
    (run.gpuFps === null || (Number.isFinite(run.gpuFps) && run.gpuFps >= 0)) &&
    (run.gpuMs == null || (Number.isFinite(run.gpuMs) && run.gpuMs > 0))
}

export default function Benchmark(): React.JSX.Element {
  const { t } = useI18n()
  const [view, setView] = useState<'local' | 'games' | 'references'>('games')
  const [recordingBusy, setRecordingBusy] = useState(false)
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
    } catch (error) {
      console.error('[Pkaizen] Benchmark history:', error)
      toast(t('forge.historyError'), 'error')
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
      if (![disk.readMBps, disk.writeMBps].every((value) => Number.isFinite(value) && value > 0)) {
        throw new Error('Invalid disk benchmark throughput')
      }
      signal.throwIfAborted()
      setPhase('gpu')
      const canvas = canvasRef.current
      if (!canvas) throw new Error('Benchmark canvas unavailable')
      canvas.width = 1280
      canvas.height = 720
      const gpu = await runGpuBench(canvas, signal)
      signal.throwIfAborted()
      const gpuFps = gpu.fps
      setGpuName(gpu.renderer)
      if (gpu.error) toast(gpu.error, 'error')

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
        gpuMs: gpu.gpuMs,
        score
      }
      setResult(runData)
      const newHistory = [runData, ...history].slice(0, 10)
      setHistory(newHistory)
      try { localStorage.setItem(HISTORY_KEY, JSON.stringify(newHistory)) } catch (error) {
        console.error('[Pkaizen] Save benchmark history:', error)
        toast(t('forge.historyError'), 'error')
      }
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
      <div className="toolbar" role="tablist" aria-label={t('bench.title')}>
        {([
          ['games', 'record.tab'], ['references', 'simple.gamesTab'], ['local', 'simple.localTab']
        ] as const).map(([id, key]) => <button key={id} role="tab" aria-selected={view === id}
          className={`btn ${view === id ? 'primary' : ''}`} disabled={phase !== 'idle' || recordingBusy} onClick={() => setView(id)}>{t(key)}</button>)}
      </div>
      {view === 'games' && <GameRecording onBusy={setRecordingBusy} />}
      {view === 'references' && <GamingOverview onMeasure={() => setView('games')} />}
      {view === 'local' && <>
      <h2>{t('gaming.synthetic')}</h2>
      <p className="subtitle">{t('forge.explanation')}</p>
      <p className="banner info">{t('forge.prepare')}</p>

      <div className="toolbar">
        <button className="btn primary" disabled={phase !== 'idle'} onClick={run}>
          {phase !== 'idle' ? <span className="spinner" /> : '🧪'} {t('bench.run')}
        </button>
        {phase !== 'idle' && (
          <button className="btn" onClick={() => controller.current?.abort()}>{t('bench.cancel')}</button>
        )}
        {phase !== 'idle' && <span className="muted">{PHASE_LABEL[phase]}</span>}
      </div>

      <canvas key={canvasKey} ref={canvasRef} id="bench-canvas" style={{ display: phase === 'gpu' ? 'block' : 'none', width: '100%', maxWidth: 640, aspectRatio: '16 / 9', borderRadius: 8 }} />

      {result && (
        <>
          <div className="card gaming-block">
            <h2>{t('forge.complete')}</h2>
            <h3>{t('forge.cpu')}</h3>
            <p>{t('forge.cpuHelp', (result.cpuSingle / 1000).toFixed(2), (result.cpuMulti / 1000).toFixed(2), result.threads)}</p>
            <p>{t('forge.diskHelp', (256 / result.writeMBps).toFixed(2), (256 / result.readMBps).toFixed(2))}</p>
            <h3>{t('forge.gpu')}</h3>
            <div className="big">{result.gpuFps === null ? t('bench.unavailable') :
              result.gpuMs != null ? t('forge.gpuTime', result.gpuMs.toFixed(3)) : t('forge.rendered')}</div>
            <p>{t('forge.gpuHelp')}</p>
            {result.gpuMs == null && <p className="sub">{t('forge.noTimer')}</p>}
            {gpuName && <p className="sub">{gpuName}</p>}
          </div>
          <details className="card gaming-block">
            <summary>{t('forge.technical')}</summary>
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
              <h3>{t('forge.gpu')}</h3>
              <div className="big">{result.gpuMs == null ? t('bench.unavailable') : `${result.gpuMs.toFixed(3)} ms`}</div>
              <div className="sub">
                {t('forge.gpuHelp')}
                {gpuName && (
                  <>
                    <br />
                    <span style={{ opacity: 0.7 }}>{t('bench.renderedOn')} {gpuName}</span>
                  </>
                )}
              </div>
            </div>
          </div>
          </details>
        </>
      )}

      {history.length > 0 && (
        <details className="card gaming-block">
          <summary>{t('bench.history')}</summary>
          <table>
            <thead>
              <tr>
                <th>{t('bench.date')}</th>
                <th>{t('bench.cpuIndex')}</th>
                <th>CPU 1c</th>
                <th>CPU multi</th>
                <th>{t('bench.write')}</th>
                <th>{t('bench.read')}</th>
                <th>{t('forge.gpu')}</th>
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
                  <td>{h.gpuMs == null ? t('bench.unavailable') : `${h.gpuMs.toFixed(3)} ms`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}
      </>}
    </>
  )
}
