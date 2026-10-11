import { useEffect, useRef, useState } from 'react'
import type { GamingHardware } from '../../../shared/types'
import { useI18n, type StrKey } from '../lib/i18n'
import { GAMES, gameGuide } from '../lib/gaming'
import { REFERENCE_GAMES, REFERENCE_SOURCE, referenceGpu, referencesFor, referenceScreenVerdict, roundedFps, SUPPORTED_GPUS } from '../lib/gameReferences'

const VERDICT: Record<ReturnType<typeof referenceScreenVerdict>, StrKey> = {
  unknown: 'simple.unknownHz', below: 'simple.below', variable: 'simple.variable', headroom: 'simple.headroom'
}

export default function GamingOverview(): React.JSX.Element {
  const { t, lang } = useI18n()
  const [hardware, setHardware] = useState<GamingHardware | null>(null)
  const [gpuIndex, setGpuIndex] = useState(0)
  const [displayIndex, setDisplayIndex] = useState(0)
  const [resolution, setResolution] = useState('')
  const [game, setGame] = useState('all')
  const [installed, setInstalled] = useState<string[]>([])
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState('')
  const [libraryErrors, setLibraryErrors] = useState<string[]>([])
  const generation = useRef(0)

  const scan = async (): Promise<void> => {
    const token = ++generation.current
    setBusy(true)
    setError('')
    setHardware(null)
    setInstalled([])
    setLibraryErrors([])
    const [config, library] = await Promise.allSettled([window.api.getGamingHardware(), window.api.getInstalledGames()])
    if (token !== generation.current) return
    if (config.status === 'fulfilled') {
      const value = config.value
      const main = Math.max(0, value.displays.findIndex((display) => display.main))
      setHardware(value)
      setGpuIndex(value.gpus.length === 1 ? 0 : -1)
      setDisplayIndex(main)
      const screen = value.displays[main]
      setResolution(screen && screen.resX > 0 && screen.resY > 0 ? `${screen.resX}x${screen.resY}` : '')
    } else {
      console.error('[Pkaizen] Gaming overview:', config.reason)
      setError(`${t('simple.failed')} ${String(config.reason)}`)
    }
    if (library.status === 'fulfilled') {
      setInstalled(library.value.games.map((entry) => entry.name))
      setLibraryErrors(library.value.warnings)
    } else {
      console.error('[Pkaizen] Game library:', library.reason)
      setLibraryErrors([String(library.reason)])
    }
    setBusy(false)
  }

  useEffect(() => {
    void scan()
    return () => { generation.current++ }
  }, [])

  const display = hardware?.displays[displayIndex]
  const gpu = hardware?.gpus[gpuIndex]
  const [width, height] = resolution.split('x').map(Number)
  const matched = gpu ? referenceGpu(gpu.model, hardware?.isLaptop ?? null) : null
  const references = gpu ? referencesFor(gpu.model, hardware?.isLaptop ?? null, width, height) : []
  const rows = references.filter((row) => game === 'all' || row.id === game)
  const sameResolution = display?.resX === width && display?.resY === height
  const resolutionChoices = [...new Set([
    ...(display && display.resX > 0 && display.resY > 0 ? [`${display.resX}x${display.resY}`] : []),
    '2560x1440', '3840x2160'
  ])]
  const games = new Map<string, string>(REFERENCE_GAMES.map((entry) => [entry.id, entry.name]))
  for (const entry of GAMES) if (entry.id !== 'other' && !games.has(entry.id)) games.set(entry.id, entry.name)
  for (const name of installed) {
    const known = gameGuide(name)
    if (known.id === 'other' && ![...games.values()].some((value) => value.toLowerCase() === name.toLowerCase())) games.set(`installed:${name}`, name)
  }

  return <section className="gaming-workbench" aria-label={t('simple.title')}>
    <h2>{t('simple.title')}</h2>
    <p className="subtitle">{t('simple.intro')}</p>
    <button className="btn" disabled={busy} onClick={() => void scan()}>
      {busy && <span className="spinner" />} {busy ? t('simple.loading') : t('simple.refresh')}
    </button>
    {lang !== 'en' && lang !== 'fr' && <p className="banner info">{t('features.language')}</p>}
    {error && <p role="alert" className="banner warn">{error}</p>}
    {hardware && <>
      {hardware.warnings.map((warning, index) => <p role="alert" className="banner warn" key={index}>{warning}</p>)}
      <p className="gaming-advice">{t('simple.pc', hardware.cpu || t('ready.unknown'), hardware.ramGB)} · {
        t(hardware.isLaptop === true ? 'simple.laptop' : hardware.isLaptop === false ? 'simple.desktop' : 'simple.deviceUnknown')
      }</p>
      <div className="gaming-fields">
        <label className="gaming-field">{t('simple.gpu')}
          <select aria-label={t('simple.gpu')} value={gpuIndex} onChange={(event) => setGpuIndex(Number(event.target.value))}>
            {hardware.gpus.length !== 1 && <option value={-1}>{t('simple.gpu')}</option>}
            {hardware.gpus.map((entry, index) => <option key={index} value={index}>{entry.model}</option>)}
          </select>
        </label>
        <label className="gaming-field">{t('simple.display')}
          <select aria-label={t('simple.display')} value={displayIndex} onChange={(event) => {
            const index = Number(event.target.value)
            setDisplayIndex(index)
            const next = hardware.displays[index]
            setResolution(next && next.resX > 0 && next.resY > 0 ? `${next.resX}x${next.resY}` : '')
          }}>
            {hardware.displays.length === 0 && <option>{t('ready.unknown')}</option>}
            {hardware.displays.map((entry, index) => <option key={entry.id ?? index} value={index}>
              {entry.model || t('ready.unknown')} · {entry.resX} × {entry.resY} · {entry.hz > 0 ? `${entry.hz} Hz` : t('ready.unknown')}{entry.main ? ` · ${t('simple.primary')}` : ''}
            </option>)}
          </select>
        </label>
        <label className="gaming-field">{t('simple.resolution')}
          <select aria-label={t('simple.resolution')} value={resolution} onChange={(event) => setResolution(event.target.value)}>
            {!resolution && <option value="">{t('ready.unknown')}</option>}
            {resolutionChoices.map((value) => <option key={value} value={value}>{value.replace('x', ' × ')}</option>)}
          </select>
        </label>
        <label className="gaming-field">{t('simple.game')}
          <select aria-label={t('simple.game')} value={game} onChange={(event) => setGame(event.target.value)}>
            <option value="all">{t('simple.all')}</option>
            {[...games].map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
        </label>
      </div>
      {display && <p className="sub">{display.hz > 0 ? t('simple.windows', display.hz) : t('simple.unknownHz')}</p>}
      <p className="banner info">{t('simple.testPc')}</p>
      {!matched ? <p role="status" className="banner warn">{t('simple.noGpu')}</p> :
        references.length === 0 ? <p role="status" className="banner info">{t('simple.noResolution')}</p> :
          rows.length === 0 ? <p role="status" className="banner info">{t('simple.noGame')}</p> : null}
      {rows.length > 0 && !sameResolution && <p className="banner info">{t('simple.otherResolution')}</p>}
      <div className="grid">
        {rows.map((row) => <article className="card gaming-block" key={row.id} aria-label={row.name}>
          <h3>{row.name}</h3>
          <p>{t('simple.settings', row.preset, row.width, row.height)}</p>
          <div className="big">{t('simple.fps', roundedFps(row.average))}</div>
          <p className="sub">{t('simple.reference')} · {row.gpu}</p>
          <p>{t('simple.low', roundedFps(row.low1))}</p>
          {sameResolution && display && <p className="gaming-advice">{t(VERDICT[referenceScreenVerdict(row.average, row.low1, display.hz)], display.hz)}</p>}
          {row.cpuSensitive && <p className="sub">{t('simple.cpuSensitive')}</p>}
          <p className="sub">{t('simple.source', REFERENCE_SOURCE.publisher, REFERENCE_SOURCE.published, REFERENCE_SOURCE.verified)}</p>
        </article>)}
      </div>
      <details className="card gaming-block">
        <summary>{t('simple.method')}</summary>
        <p>{t('simple.methodText')}</p><p>{t('simple.rendering')}</p>
        <p>{t('simple.coverage')}</p><p>{SUPPORTED_GPUS.join(' · ')}</p>
        <p>{REFERENCE_SOURCE.title} · {REFERENCE_SOURCE.cpu} · {REFERENCE_SOURCE.memory} · {REFERENCE_SOURCE.os}</p>
        <p>{REFERENCE_SOURCE.drivers}</p>
        <code className="reference-address">{REFERENCE_SOURCE.url}</code>
        {rows.map((row) => <p key={row.id} className="sub">{row.name}: {row.average} FPS / 1% low {row.low1} FPS<br />
          <code className="reference-address">{row.chartUrl}</code></p>)}
        {libraryErrors.map((message, index) => <p key={index} role="alert">{message}</p>)}
      </details>
    </>}
  </section>
}
