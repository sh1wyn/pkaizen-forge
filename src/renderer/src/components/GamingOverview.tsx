import { useEffect, useRef, useState } from 'react'
import type { GamingHardware } from '../../../shared/types'
import { useI18n, type StrKey } from '../lib/i18n'
import { GAMES, gameGuide } from '../lib/gaming'
import { REFERENCE_GAMES, REFERENCE_SOURCES, referenceGpu, referencesFor, referenceScreenVerdict, roundedFps, SUPPORTED_GPUS } from '../lib/gameReferences'

const VERDICT: Record<ReturnType<typeof referenceScreenVerdict>, StrKey> = {
  unknown: 'simple.unknownHz', below: 'simple.below', variable: 'simple.variable', headroom: 'simple.headroom', capped: 'simple.capped'
}

export default function GamingOverview({ onMeasure }: { onMeasure: () => void }): React.JSX.Element {
  const { t, lang } = useI18n()
  const [hardware, setHardware] = useState<GamingHardware | null>(null)
  const [gpuIndex, setGpuIndex] = useState(0)
  const [displayIndex, setDisplayIndex] = useState(0)
  const [resolution, setResolution] = useState('')
  const [game, setGame] = useState('all')
  const [declaredType, setDeclaredType] = useState<boolean | null>(null)
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
    setGame('all')
    setDeclaredType(null)
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
  const laptop = hardware?.isLaptop ?? declaredType
  const matched = gpu ? referenceGpu(gpu.model, laptop, gpu.vramMB) : null
  const references = gpu ? referencesFor(gpu.model, laptop, width, height, gpu.vramMB) : []
  const rows = references.filter((row) => game === 'all' || row.id === game)
  const availableIds = new Set(references.map((row) => row.id))
  const emptyReason = !matched ? 'simple.noGpu' : references.length === 0 ? 'simple.noResolution' : rows.length === 0 ? 'simple.noGame' : null
  const sameResolution = display?.resX === width && display?.resY === height
  const resolutionChoices = [...new Set([
    ...(display && display.resX > 0 && display.resY > 0 ? [`${display.resX}x${display.resY}`] : []),
    '1920x1080', '2560x1440', '3840x2160'
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
        {hardware.isLaptop === null && <label className="gaming-field">{t('simple.deviceType')}
          <select aria-label={t('simple.deviceType')} value={declaredType === null ? '' : declaredType ? 'laptop' : 'desktop'}
            onChange={(event) => setDeclaredType(event.target.value === 'desktop' ? false : event.target.value === 'laptop' ? true : null)}>
            <option value="">{t('ready.unknown')}</option>
            <option value="desktop">{t('simple.desktop')}</option>
            <option value="laptop">{t('simple.laptop')}</option>
          </select>
        </label>}
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
            {availableIds.size > 0 && <optgroup label={t('simple.availableGroup', availableIds.size)}>
              {[...games].filter(([id]) => availableIds.has(id)).map(([id, name]) => <option key={id} value={id}>{name}</option>)}
            </optgroup>}
            <optgroup label={t('simple.unavailableGroup')}>
              {[...games].filter(([id]) => !availableIds.has(id)).map(([id, name]) =>
                <option key={id} value={id}>{name} — {t('simple.notDocumented')}</option>)}
            </optgroup>
          </select>
        </label>
      </div>
      {hardware.isLaptop === null && declaredType !== null && <p className="banner info">{t('simple.declaredType')}</p>}
      <p className="sub">{t('simple.available', availableIds.size, references.length)}</p>
      {display && <p className="sub">{display.hz > 0 ? t('simple.windows', display.hz) : t('simple.unknownHz')}</p>}
      <p className="banner info">{t('simple.testPc')}</p>
      {emptyReason && <div role="status" className="banner info">
        <p>{t(emptyReason)}</p>
        <button className="btn" onClick={onMeasure}>{t('simple.measureInstead')}</button>
      </div>}
      {rows.length > 0 && !sameResolution && <p className="banner info">{t('simple.otherResolution')}</p>}
      <div className="grid gaming-reference-grid">
        {rows.map((row) => <article className="card gaming-block" key={`${row.id}:${row.preset}`} aria-label={row.name}>
          <h3>{row.name}</h3>
          <p>{t('simple.settings', row.preset, row.width, row.height)}</p>
          <div className="big">{t('simple.fps', roundedFps(row.average))}</div>
          <p className="sub">{t('simple.reference')} · {row.gpu}</p>
          <p className="sub">{t('simple.sourcePc', row.source.cpu, row.source.memory)}</p>
          {row.gpu.startsWith('Arc ') && <p className="banner info">{t('simple.arcConditions')}</p>}
          <p>{t('simple.low', roundedFps(row.low1))}</p>
          {row.capFps && <p className="banner info">{t('simple.cap', row.capFps)}</p>}
          {sameResolution && display && <p className="gaming-advice">{t(VERDICT[referenceScreenVerdict(row.average, row.low1, display.hz, row.capFps)], display.hz)}</p>}
          {row.cpuSensitive && <p className="sub">{t('simple.cpuSensitive')}</p>}
          {row.scene !== 'unspecified' && <p className="sub">{t(row.scene === 'built-in' ? 'simple.builtinScene' : 'simple.gameplayScene')}</p>}
          <p className="sub">{t('simple.source', row.source.publisher, row.source.published, row.source.verified)}</p>
        </article>)}
      </div>
      <details className="card gaming-block">
        <summary>{t('simple.method')}</summary>
        <p>{t('simple.methodText')}</p><p>{t('simple.rendering')}</p>
        <p>{t('simple.coverage', REFERENCE_GAMES.length, SUPPORTED_GPUS.length)}</p><p>{SUPPORTED_GPUS.join(' · ')}</p>
        {REFERENCE_SOURCES.map((source) => <div key={source.url}>
          <p>{source.title} · {source.published}</p>
          <p>{source.cpu} · {source.memory} · {source.os || t('simple.sourceOsUnknown')} · {source.drivers}</p>
          <code className="reference-address">{source.url}</code>
          {'followUpUrl' in source && <p><code className="reference-address">{source.followUpUrl}</code></p>}
        </div>)}
        {rows.map((row) => <p key={`${row.id}:${row.preset}`} className="sub">{row.name} ({row.preset}): {row.average} FPS / 1% low {row.low1} FPS<br />
          <code className="reference-address">{row.chartUrl}</code></p>)}
        {libraryErrors.map((message, index) => <p key={index} role="alert">{message}</p>)}
      </details>
    </>}
  </section>
}
