import { useEffect, useRef, useState } from 'react'
import type { GamingHardware } from '../../../shared/types'
import { baselineComparison, performanceVerdict, validRecording, type CaptureProcess, type RecordingProgress, type RunConditions, type SavedRecording } from '../../../shared/recording'
import { useI18n, type StrKey } from '../lib/i18n'
import GamingBenchmark from './GamingBenchmark'

const HISTORY_KEY = 'pkaizen-recordings-v1'
const VERDICTS: Record<ReturnType<typeof performanceVerdict>, StrKey> = {
  met: 'record.met', below: 'record.below', uneven: 'record.uneven'
}
const BASELINES: Record<ReturnType<typeof baselineComparison>['kind'], StrKey> = {
  insufficient: 'record.insufficient', lower: 'record.lower', consistent: 'record.consistent', higher: 'record.higher'
}

export default function GameRecording({ onBusy }: { onBusy: (value: boolean) => void }): React.JSX.Element {
  const { t, lang } = useI18n()
  const [processes, setProcesses] = useState<CaptureProcess[]>([])
  const [pid, setPid] = useState('')
  const [hardware, setHardware] = useState<GamingHardware | null>(null)
  const [tool, setTool] = useState<{ ready: boolean; supported: boolean; version: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [recording, setRecording] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [progress, setProgress] = useState<RecordingProgress | null>(null)
  const [now, setNow] = useState(Date.now())
  const [seconds, setSeconds] = useState(30)
  const [conditions, setConditions] = useState<RunConditions>({ resolution: '', settings: '', scene: '', frameGeneration: 'unknown', target: 144 })
  const [history, setHistory] = useState<SavedRecording[]>([])
  const [result, setResult] = useState<SavedRecording | null>(null)
  const [advanced, setAdvanced] = useState(false)
  const alive = useRef(true)
  const running = useRef(false)
  const mainDisplay = hardware?.displays.find((display) => display.main) ?? hardware?.displays[0]

  const setWorking = (value: boolean): void => { setBusy(value); onBusy(value) }
  const fail = (reason: unknown): void => {
    console.error('[Pkaizen] Game recording:', reason)
    if (alive.current) setError(String(reason))
  }
  const refresh = async (): Promise<void> => {
    setWorking(true)
    setError('')
    const results = await Promise.allSettled([
      window.api.captureProcesses(), window.api.getGamingHardware(), window.api.recordingToolStatus()
    ])
    if (!alive.current) return
    const [apps, config, status] = results
    setProcesses(apps.status === 'fulfilled' ? apps.value : [])
    if (apps.status === 'fulfilled') setPid((value) => apps.value.some((app) => String(app.pid) === value) ? value : apps.value.length === 1 ? String(apps.value[0].pid) : '')
    setHardware(config.status === 'fulfilled' ? config.value : null)
    setTool(status.status === 'fulfilled' ? status.value : null)
    const failures = results.filter((entry) => entry.status === 'rejected').map((entry) => String(entry.reason))
    if (failures.length) fail(failures.join('\n'))
    setWorking(false)
  }

  useEffect(() => {
    alive.current = true
    void refresh()
    try {
      const raw = localStorage.getItem(HISTORY_KEY) || '[]'
      if (raw.length > 200_000) throw new Error(t('gaming.storage'))
      const saved: unknown = JSON.parse(raw)
      if (!Array.isArray(saved) || saved.length > 10 || !saved.every(validRecording)) throw new Error(t('gaming.storage'))
      setHistory(saved)
      setResult(saved[0] ?? null)
    } catch (reason) { fail(reason) }
    const unsubscribe = window.api.onRecordingProgress(setProgress)
    return () => {
      alive.current = false
      unsubscribe()
      if (running.current) void window.api.cancelRecording().catch((reason) => console.error('[Pkaizen] Cancel recording:', reason))
      onBusy(false)
    }
  }, [])

  useEffect(() => {
    if (!recording) return
    const timer = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(timer)
  }, [recording])

  const install = async (): Promise<void> => {
    setWorking(true)
    setError('')
    try {
      await window.api.installRecordingTool()
      if (alive.current) setTool(await window.api.recordingToolStatus())
    } catch (reason) { fail(reason) }
    finally { if (alive.current) setWorking(false) }
  }
  const remove = async (): Promise<void> => {
    setWorking(true)
    setError('')
    try {
      await window.api.removeRecordingTool()
      if (alive.current) setTool(await window.api.recordingToolStatus())
    } catch (reason) { fail(reason) }
    finally { if (alive.current) setWorking(false) }
  }
  const capture = async (): Promise<void> => {
    const app = processes.find((entry) => String(entry.pid) === pid)
    if (!app) { fail(t('record.pick')); return }
    const context = { ...conditions }
    setWorking(true)
    setRecording(true)
    running.current = true
    setProgress(null)
    setError('')
    setNotice('')
    setResult(null)
    try {
      const run = await window.api.startRecording(app.pid, app.started, seconds)
      if (!alive.current) return
      if (!run) { setNotice(t('record.cancelled')); return }
      const saved: SavedRecording = { run, conditions: context }
      if (!validRecording(saved)) throw new Error(t('record.invalid'))
      setResult(saved)
      const next = [saved, ...history].slice(0, 10)
      localStorage.setItem(HISTORY_KEY, JSON.stringify(next))
      setHistory(next)
    } catch (reason) { fail(reason) }
    finally {
      running.current = false
      if (alive.current) { setWorking(false); setRecording(false); setProgress(null) }
    }
  }
  const cancel = async (): Promise<void> => {
    try { await window.api.cancelRecording() } catch (reason) { fail(reason) }
  }
  const relaunch = async (): Promise<void> => {
    try {
      const response = await window.api.relaunchAdmin()
      if (!response.ok) fail(response.message || t('record.error'))
    } catch (reason) { fail(reason) }
  }
  const clear = (): void => {
    try {
      localStorage.removeItem(HISTORY_KEY)
      setHistory([])
      setResult(null)
    } catch (reason) { fail(reason) }
  }
  const comparison = result ? baselineComparison(result, history) : null
  const number = (value: number): string => value.toLocaleString(lang, { maximumFractionDigits: 1 })

  return <section className="gaming-workbench" aria-label={t('record.title')}>
    <h2>{t('record.title')}</h2>
    <p className="subtitle">{t('record.intro')}</p>
    {lang !== 'en' && lang !== 'fr' && <p className="banner info">{t('features.language')}</p>}
    {error && <div role="alert" className="banner warn">{t('record.error')} {error}</div>}
    {error && tool?.ready && <button className="btn" disabled={busy} onClick={() => void relaunch()}>{t('record.admin')}</button>}
    {notice && <p role="status">{notice}</p>}
    {hardware && <div className="card gaming-advice">
      <p>{hardware.cpu || t('ready.unknown')} · {hardware.gpus.map((gpu) => gpu.model).join(' / ') || t('ready.unknown')} · {hardware.ramGB} GB</p>
      {hardware.displays.map((display) => <p key={display.id ?? display.model}>
        {display.model || t('ready.unknown')} · {display.resX} × {display.resY} · {display.hz || '?'} Hz
        {display.main ? ` · ${t('simple.primary')}` : ''}
      </p>)}
      <p className="sub">{t('record.screen')}</p>
      {hardware.warnings.map((warning, index) => <p key={index} role="alert">{warning}</p>)}
    </div>}
    <fieldset className="card gaming-block" disabled={busy}>
      <legend>{t('record.setup')}</legend>
      <button className="btn" onClick={() => void refresh()}>{t('record.refresh')}</button>
      <label className="gaming-field">{t('record.process')}
        <select aria-label={t('record.process')} value={pid} onChange={(event) => setPid(event.target.value)}>
          <option value="">{t('record.pick')}</option>
          {processes.map((entry) => <option key={`${entry.pid}:${entry.started}`} value={entry.pid}>{entry.name} · {entry.title} (PID {entry.pid})</option>)}
        </select>
      </label>
      {!processes.length && <p>{t('record.noProcess')}</p>}
      <div className="gaming-fields">
        <label className="gaming-field">{t('record.duration')}
          <select aria-label={t('record.duration')} value={seconds} onChange={(event) => setSeconds(Number(event.target.value))}>
            <option value={30}>30 s</option><option value={60}>60 s</option>
          </select>
        </label>
        <label className="gaming-field">{t('record.target')}
          <select aria-label={t('record.target')} value={conditions.target} onChange={(event) => setConditions({ ...conditions, target: Number(event.target.value) })}>
            {[60, 120, 144, 165, 240, 360, 480, 540].map((fps) => <option key={fps} value={fps}>{fps} FPS</option>)}
          </select>
        </label>
      </div>
      <details>
        <summary>{t('record.conditions')}</summary>
        <p>{t('record.conditionsNote')}</p>
        <div className="gaming-fields">
          {(['resolution', 'settings', 'scene'] as const).map((key) => <label className="gaming-field" key={key}>{t(`record.${key}`)}
            <input maxLength={500} value={conditions[key]} onChange={(event) => setConditions({ ...conditions, [key]: event.target.value })} />
          </label>)}
          <label className="gaming-field">{t('record.generation')}
            <select aria-label={t('record.generation')} value={conditions.frameGeneration} onChange={(event) => {
              const value = event.target.value
              if (value === 'off' || value === 'on' || value === 'unknown') setConditions({ ...conditions, frameGeneration: value })
            }}>
              <option value="unknown">{t('ready.unknown')}</option><option value="off">{t('ready.no')}</option><option value="on">{t('ready.yes')}</option>
            </select>
          </label>
        </div>
      </details>
      {tool?.supported === false && <p role="alert">{t('record.unsupported')}</p>}
      {!tool?.ready && <><p>{t('record.download')}</p>
        <button className="btn" disabled={!tool?.supported} onClick={() => void install()}>{t('record.install')}</button></>}
      <p>{t('record.instructions')}</p>
      <button className="btn primary" disabled={!tool?.ready || !tool.supported || !pid} onClick={() => void capture()}>{t('record.start', seconds)}</button>
    </fieldset>
    {recording && <div className="banner info" role="status">
      {!progress ? t('record.preparing') : now < progress.startsAt
        ? t('record.countdown', Math.max(0, Math.ceil((progress.startsAt - now) / 1000)))
        : t('record.running', Math.max(0, Math.ceil((progress.endsAt - now) / 1000)))}
      <button className="btn danger" onClick={() => void cancel()}>{t('record.cancel')}</button>
    </div>}
    {result && <section className="card gaming-block" aria-label={t('record.result')}>
      <h2>{t('record.result')} · {result.run.process}</h2>
      <p>{new Date(result.run.date).toLocaleString(lang)} · {number(result.run.summary.durationSeconds)} s</p>
      {result.run.warnings.map((warning, index) => <p key={index} role="alert" className="banner warn">{warning}</p>)}
      <div className="grid">
        <div><h3>{t('record.average')}</h3><div className="big">{number(result.run.summary.averageFps)} FPS</div></div>
        <div><h3>{t('record.low')}</h3><div className="big">{number(result.run.summary.low1Fps)} FPS</div></div>
        <div><h3>{t('record.stutters')}</h3><div className="big">{result.run.summary.over50}</div></div>
      </div>
      <p className="gaming-advice">{t(VERDICTS[performanceVerdict(result.run.summary, result.conditions.target)], result.conditions.target)}</p>
      <p>{t('record.action')}</p>
      {comparison && <p className="gaming-advice">{t(BASELINES[comparison.kind], comparison.samples, number(comparison.percent ?? 0))}</p>}
      <p className="sub">{t('record.thresholds')}</p>
      <p>{t('record.context', result.conditions.resolution || '?', result.conditions.settings || '?', result.conditions.scene || '?', result.conditions.frameGeneration)}</p>
    </section>}
    <details className="card gaming-block">
      <summary>{t('record.method')}</summary>
      <p>{t('record.limits')}</p>
      <p>{t('record.privacy')}</p>
      <p>{t('record.safety')}</p>
      <button className="btn danger" disabled={busy} onClick={clear}>{t('record.clear', history.length)}</button>
      <button className="btn" disabled={busy} onClick={() => void remove()}>{t('record.remove')}</button>
    </details>
    <details className="card gaming-block" onToggle={(event) => setAdvanced(event.currentTarget.open)}>
      <summary>{t('simple.advanced')}</summary>
      {advanced && <GamingBenchmark disabled={busy} initialDisplay={mainDisplay} />}
    </details>
  </section>
}
