import { useEffect, useMemo, useRef, useState } from 'react'
import type { DetailedInfo, GameLibrary } from '../../../shared/types'
import { useI18n, type StrKey } from '../lib/i18n'
import { useToast } from './Toast'
import {
  assessDisplay, CaptureError, GAMES, MAX_CAPTURE_BYTES, frameBuckets, gameGuide, parseCapture, sameScenario,
  summarizeFrames, targetCoverage, validSession, type GamingSession, type SessionContext
} from '../lib/gaming'

const HISTORY_KEY = 'pkaizen-gaming-sessions-v1'
const ERRORS: Record<CaptureError['code'], StrKey> = {
  size: 'gaming.errorSize', format: 'gaming.errorFormat', column: 'gaming.errorColumn',
  mixed: 'gaming.errorMixed', value: 'gaming.errorValue', short: 'gaming.errorShort'
}

export default function GamingBenchmark({ disabled }: { disabled: boolean }): React.JSX.Element {
  const { t, lang } = useI18n()
  const toast = useToast()
  const [gameId, setGameId] = useState<string>('fortnite')
  const [customName, setCustomName] = useState('')
  const [resolution, setResolution] = useState('1920 × 1080')
  const [settings, setSettings] = useState('')
  const [scene, setScene] = useState('')
  const [frameGeneration, setFrameGeneration] = useState<SessionContext['frameGeneration']>('unknown')
  const [target, setTarget] = useState(60)
  const [capture, setCapture] = useState<{ frames: number[]; column: string; name: string; date: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [history, setHistory] = useState<GamingSession[]>([])
  const [baselineIndex, setBaselineIndex] = useState('')
  const [exportUrl, setExportUrl] = useState('')
  const [library, setLibrary] = useState<GameLibrary | null>(null)
  const [scanBusy, setScanBusy] = useState(false)
  const [displays, setDisplays] = useState<DetailedInfo['displays'] | null>(null)
  const [displayIndex, setDisplayIndex] = useState(0)
  const [displayBusy, setDisplayBusy] = useState(false)
  const request = useRef(0)
  const game = gameId === 'other' ? gameGuide(customName) : GAMES.find((entry) => entry.id === gameId) ?? GAMES[GAMES.length - 1]
  const gameName = gameId === 'other' ? customName.trim() : game.name
  const summary = useMemo(() => capture ? summarizeFrames(capture.frames) : null, [capture])
  const buckets = useMemo(() => capture ? frameBuckets(capture.frames) : [], [capture])
  const session = useMemo<GamingSession | null>(() => capture && summary ? {
    version: 1, date: capture.date, context: { game: gameName, resolution, settings, scene, frameGeneration }, summary
  } : null, [capture, summary, gameName, resolution, settings, scene, frameGeneration])
  const complete = session !== null && Object.values(session.context).every((value) => value.trim().length > 0)
  const baseline = history[Number(baselineIndex)]
  const comparison = session && baselineIndex !== '' && baseline
  const alreadySaved = session && history.some((entry) => JSON.stringify(entry) === JSON.stringify(session))
  const display = displays?.[displayIndex]
  const assessment = display ? assessDisplay(display, [...history, ...(session && complete ? [session] : [])]) : null

  useEffect(() => {
    try {
      const raw = localStorage.getItem(HISTORY_KEY)
      if (raw && raw.length > 200_000) throw new Error('History too large')
      const saved: unknown = JSON.parse(raw || '[]')
      if (!Array.isArray(saved) || saved.length > 10 || !saved.every(validSession)) throw new Error('Invalid history')
      setHistory(saved)
    } catch (error) {
      console.error('[Pkaizen] Gaming history:', error)
      setError(t('gaming.storage'))
    }
    return () => { request.current++ }
  }, [t])

  useEffect(() => {
    if (!session || !complete) { setExportUrl(''); return }
    const url = URL.createObjectURL(new Blob([JSON.stringify({
      ...session,
      method: 'presented-frame-intervals-v1',
      low1Definition: '1000 / mean(slowest ceil(frameCount * 0.01) frame times in ms)',
      sourceColumn: capture?.column,
      disclaimer: 'Measured imported data, not a prediction. Not input latency or a guarantee of displayed FPS.'
    }, null, 2)], { type: 'application/json' }))
    setExportUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [session, complete, capture?.column])

  const importFile = async (file: File): Promise<void> => {
    const id = ++request.current
    setBusy(true)
    setError('')
    setCapture(null)
    try {
      if (file.size > MAX_CAPTURE_BYTES) throw new CaptureError('size')
      const text = await file.text()
      if (id !== request.current) return
      const parsed = parseCapture(text)
      setCapture({ ...parsed, name: file.name, date: new Date().toISOString() })
    } catch (error) {
      if (id === request.current) {
        console.error('[Pkaizen] Capture import:', error)
        setError(error instanceof CaptureError ? t(ERRORS[error.code], error.row) : t('gaming.errorRead'))
      }
    } finally {
      if (id === request.current) setBusy(false)
    }
  }

  const scanGames = async (): Promise<void> => {
    setScanBusy(true)
    setError('')
    try { setLibrary(await window.api.getInstalledGames()) } catch (error) {
      setLibrary(null)
      setError(String(error))
    } finally { setScanBusy(false) }
  }

  const scanDisplays = async (): Promise<void> => {
    setDisplayBusy(true)
    try {
      const details = await window.api.getDetailedInfo()
      setDisplays(details.displays)
      setDisplayIndex(Math.max(0, details.displays.findIndex((entry) => entry.main)))
    } catch (error) {
      setDisplays(null)
      setError(String(error))
    } finally { setDisplayBusy(false) }
  }

  const save = (): void => {
    if (!session || !complete) { toast(t('gaming.metadata'), 'error'); return }
    try {
      const next = [session, ...history].slice(0, 10)
      localStorage.setItem(HISTORY_KEY, JSON.stringify(next))
      setHistory(next)
      setBaselineIndex('')
      toast(t('gaming.saved'), 'success')
    } catch (error) {
      console.error('[Pkaizen] Save gaming session:', error)
      setError(t('gaming.storage'))
    }
  }

  const clear = (): void => {
    try {
      localStorage.removeItem(HISTORY_KEY)
      setHistory([])
      setBaselineIndex('')
    } catch (error) {
      console.error('[Pkaizen] Clear gaming history:', error)
      setError(t('gaming.storage'))
    }
  }

  const external = (url: string): void => { void window.api.openExternal(url).catch((error) => toast(String(error), 'error')) }
  const number = (value: number): string => value.toLocaleString(lang, { maximumFractionDigits: 1 })
  const delta = (value: number, reference: number): string => {
    const change = (value / reference - 1) * 100
    return `${change > 0 ? '+' : ''}${number(change)}`
  }

  return (
    <section className="gaming-workbench" aria-label={t('gaming.title')}>
      {lang !== 'en' && lang !== 'fr' && <p className="banner info">{t('features.language')}</p>}
      <h2>{t('gaming.title')}</h2>
      <p className="subtitle">{t('gaming.intro')}</p>
      <fieldset className="card gaming-block" disabled={disabled || busy || scanBusy || displayBusy}>
        <legend>{t('gaming.guide')}</legend>
        <button className="btn" onClick={() => void scanGames()}>
          {scanBusy && <span className="spinner" />} {t('gaming.scanGames')}
        </button>
        <p className="sub">{t('gaming.libraryNote')}</p>
        {library && <>
          {library.warnings.map((warning, index) => <p role="alert" className="banner warn" key={index}>{warning}</p>)}
          {library.games.length === 0 ? <p>{t('gaming.noGames')}</p> :
            <label className="gaming-field">{t('gaming.installed')}
              <select defaultValue="" onChange={(event) => {
                const installed = library.games.find((entry) => entry.id === event.target.value)
                if (installed) { setGameId('other'); setCustomName(installed.name); setCapture(null) }
              }}>
                <option value="" disabled>{t('gaming.selectInstalled')}</option>
                {library.games.map((entry) => <option value={entry.id} key={entry.id}>{entry.name} · {entry.launcher}</option>)}
              </select>
            </label>}
        </>}
        <div className="gaming-fields">
          <label className="gaming-field">{t('gaming.game')}
            <select value={gameId} onChange={(event) => { setGameId(event.target.value); setCapture(null) }}>
              {GAMES.map((entry) => <option value={entry.id} key={entry.id}>{entry.name || t('gaming.otherName')}</option>)}
            </select>
          </label>
          {gameId === 'other' && <label className="gaming-field">{t('gaming.custom')}
            <input value={customName} maxLength={200} onChange={(event) => setCustomName(event.target.value)} />
          </label>}
          <label className="gaming-field">{t('gaming.target')}
            <select value={target} onChange={(event) => setTarget(Number(event.target.value))}>
              {[30, 60, 90, 120, 144, 165, 240, 360].map((fps) => <option value={fps} key={fps}>{fps} FPS</option>)}
            </select>
          </label>
        </div>
        <p className="sub">{t('gaming.targetHelp')}</p>
        <p className="gaming-advice">{t(game.key)}</p>
        <p className="sub">{t('gaming.profilesNote')}</p>
      </fieldset>

      <fieldset className="card gaming-block" disabled={disabled || busy || scanBusy || displayBusy}>
        <legend>{t('gaming.capture')}</legend>
        <p>{t('gaming.steps')}</p>
        <div className="toolbar">
          <button className="btn" onClick={() => external('https://github.com/GameTechDev/PresentMon/releases')}>Intel PresentMon</button>
          <button className="btn" onClick={() => external('https://www.capframex.com/')}>CapFrameX</button>
        </div>
        <div className="gaming-fields">
          <label className="gaming-field">{t('gaming.resolution')}
            <input value={resolution} maxLength={80} onChange={(event) => setResolution(event.target.value)} />
          </label>
          <label className="gaming-field">{t('gaming.settings')}
            <input value={settings} maxLength={500} placeholder={t('gaming.settingsHint')} onChange={(event) => setSettings(event.target.value)} />
          </label>
          <label className="gaming-field">{t('gaming.scene')}
            <input value={scene} maxLength={500} placeholder={t('gaming.sceneHint')} onChange={(event) => setScene(event.target.value)} />
          </label>
          <label className="gaming-field">{t('gaming.generation')}
            <select aria-label={t('gaming.generation')} value={frameGeneration} onChange={(event) => {
              const value = event.target.value
              if (value === 'off' || value === 'on' || value === 'unknown') setFrameGeneration(value)
            }}>
              <option value="unknown">{t('gaming.genUnknown')}</option>
              <option value="off">{t('gaming.genOff')}</option>
              <option value="on">{t('gaming.genOn')}</option>
            </select>
          </label>
        </div>
        <label className="gaming-field">{t('gaming.import')}
          <input type="file" accept=".csv,.tsv,text/csv,text/tab-separated-values" onChange={(event) => {
            const file = event.target.files?.[0]
            event.target.value = ''
            if (file) void importFile(file)
          }} />
        </label>
        <p className="sub">{t('gaming.format')}</p>
        <p className="sub">{t('gaming.local')}</p>
      </fieldset>
      {error && <p className="banner warn" role="alert">{error}</p>}
      {busy && <span className="spinner" />}
      {capture && summary && <section className="gaming-block" aria-label={t('gaming.results')}>
        <h3>{t('gaming.results')}</h3>
        <p className="sub">{capture.name} · {t('gaming.duration', summary.count, number(summary.durationSeconds))}</p>
        {summary.durationSeconds < 30 && <p className="banner warn">{t('gaming.short')}</p>}
        <div className="grid">
          {[
            [t('gaming.average'), `${number(summary.averageFps)} FPS`, t('gaming.averageHelp')],
            [t('gaming.low'), `${number(summary.low1Fps)} FPS`, t('gaming.lowHelp')],
            [t('gaming.spikes'), String(summary.over50), t('gaming.spikesHelp')]
          ].map(([label, value, help]) => <div className="card" key={label}>
            <h3>{label}</h3><div className="big">{value}</div><p className="sub">{help}</p>
          </div>)}
        </div>
        <p className="gaming-advice">{t('gaming.coverage', number(targetCoverage(capture.frames, target)), target)}</p>
        <p className="sub">{t('gaming.coverageHelp')}</p>
        <h3>{t('gaming.chart')}</h3>
        <div className="frametime-chart" role="img" aria-label={t('gaming.p99', number(summary.p99Ms), number(summary.maxMs), summary.over100)}>
          {buckets.map((ms, index) => <div key={index} title={`${number(ms)} ms`} style={{
            height: `${Math.max(1, ms / summary.maxMs * 100)}%`,
            background: ms > 1000 / target ? 'var(--orange)' : 'var(--accent2)'
          }} />)}
        </div>
        <p>{t('gaming.p99', number(summary.p99Ms), number(summary.maxMs), summary.over100)}</p>
        <p className="sub">{t('gaming.chartHelp')}</p>
        <p className="gaming-advice">{t('gaming.advice')}</p>
        <div className="toolbar">
          <button className="btn primary" disabled={!complete || !!alreadySaved} onClick={save}>{t('gaming.save')}</button>
          {exportUrl && <a className="btn" href={exportUrl} download="pkaizen-gaming-summary.json">{t('gaming.export')}</a>}
        </div>
        {!complete && <p className="sub">{t('gaming.metadata')}</p>}
        {history.length > 0 && <label className="gaming-field">{t('gaming.baseline')}
          <select aria-label={t('gaming.baseline')} value={baselineIndex} onChange={(event) => setBaselineIndex(event.target.value)}>
            <option value="">{t('gaming.noBaseline')}</option>
            {history.map((entry, index) => <option key={index} value={index}>
              {entry.context.game} · {new Date(entry.date).toLocaleString(lang)} · {number(entry.summary.averageFps)} FPS
            </option>)}
          </select>
        </label>}
        {comparison && (sameScenario(session.context, baseline.context) ? <>
          <p className="gaming-advice">{t('gaming.comparison', delta(summary.averageFps, baseline.summary.averageFps), delta(summary.low1Fps, baseline.summary.low1Fps))}</p>
          <p className="sub">{session.context.settings !== baseline.context.settings ? t('gaming.compareNote') : t('gaming.short')}</p>
        </> : <p className="banner warn">{t('gaming.mismatch')}</p>)}
      </section>}
      {history.length > 0 && <details className="card gaming-block">
        <summary>{t('gaming.history')} ({history.length}/10)</summary>
        {history.map((entry, index) => <div className="row" key={index}><div className="row-info">
          <div className="row-title">{entry.context.game} · {number(entry.summary.averageFps)} FPS · 1% low: {number(entry.summary.low1Fps)} FPS</div>
          <div className="row-desc">{new Date(entry.date).toLocaleString(lang)} · {entry.context.resolution} · {entry.context.settings} · {entry.context.scene}</div>
        </div></div>)}
        <button className="btn danger" onClick={clear}>{t('gaming.delete')}</button>
      </details>}
      <section className="card gaming-block" aria-label={t('screen.title')}>
        <h3>{t('screen.title')}</h3>
        <button className="btn" disabled={disabled || busy || scanBusy || displayBusy} onClick={() => void scanDisplays()}>
          {displayBusy && <span className="spinner" />} {t('screen.scan')}
        </button>
        {displays?.length === 0 && <p className="banner warn">{t('screen.unknown')}</p>}
        {!!displays?.length && <label className="gaming-field">{t('screen.choose')}
          <select value={displayIndex} onChange={(event) => setDisplayIndex(Number(event.target.value))}>
            {displays.map((entry, index) => <option key={index} value={index}>
              {entry.model || t('ready.unknown')} · {entry.resX} × {entry.resY} · {entry.hz} Hz
            </option>)}
          </select>
        </label>}
        {assessment && display && <>
          <p className="gaming-advice">{t({
            unknown: 'screen.unknown', 'no-data': 'screen.noData', limited: 'screen.limited',
            balanced: 'screen.balanced', headroom: 'screen.headroom'
          }[assessment.kind] as StrKey, number(assessment.low1 ?? 0), display.hz, assessment.suggestedHz ?? 0)}</p>
          {assessment.games > 0 && <p className="sub">{t('screen.scope', assessment.games)}</p>}
        </>}
        <p className="sub">{t('screen.rule')}</p>
        <p className="gaming-advice">{t('screen.resolution')}</p>
      </section>
    </section>
  )
}
