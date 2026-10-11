import { useState } from 'react'
import { useI18n } from '../lib/i18n'
import { useToast } from '../components/Toast'

interface Check { text: string; warn: boolean }

export default function GamingReady(): React.JSX.Element {
  const { t, lang } = useI18n()
  const toast = useToast()
  const [checks, setChecks] = useState<Check[]>([])
  const [busy, setBusy] = useState(false)
  const [date, setDate] = useState('')
  const scan = async (): Promise<void> => {
    setBusy(true)
    setChecks([])
    const rows: Check[] = []
    const add = (text: string, warn = false): void => { rows.push({ text, warn }) }
    const failed = (label: string): void => add(t('ready.failed', label), true)
    try {
      const [report, details, live, network, reboot] = await Promise.allSettled([
        window.api.getSystemReport(), window.api.getDisplays(), window.api.getLiveStats(),
        window.api.getNetInfo(), window.api.checkPendingReboot()
      ])
      if (live.status === 'fulfilled') {
        const { cpuLoad, memPercent } = live.value
        if (Number.isFinite(cpuLoad)) add(t('ready.cpu', cpuLoad), cpuLoad > 20)
        else failed('CPU')
        if (Number.isFinite(memPercent)) add(t('ready.memory', memPercent), memPercent > 85)
        else failed('RAM')
      } else failed('CPU / RAM')
      if (report.status === 'fulfilled') {
        if (!report.value.volumes?.length) failed(t('dash.storage'))
        for (const volume of report.value.volumes ?? []) {
          if (Number.isFinite(volume.usePercent)) add(t('ready.disk', volume.mount, volume.usePercent), volume.usePercent >= 90)
          else failed(volume.mount)
        }
        if (report.value.isLaptop) {
          const battery = report.value.battery
          if (battery?.hasBattery && Number.isFinite(battery.percent)) {
            add(t('ready.battery', battery.percent, t(battery.isCharging ? 'ready.yes' : 'ready.no')), !battery.isCharging)
          } else failed(t('dash.battery'))
        }
      } else failed(t('dash.hardware'))
      if (details.status === 'fulfilled' && details.value.length) {
        for (const display of details.value) {
          add(t('ready.display', display.model || t('ready.unknown'),
            display.resX > 0 ? display.resX : t('ready.unknown'),
            display.resY > 0 ? display.resY : t('ready.unknown'),
            display.hz > 0 ? display.hz : t('ready.unknown')), display.hz <= 60)
        }
      } else failed(t('dash.screen'))
      if (network.status === 'fulfilled' && network.value.iface) add(t('ready.network', network.value.iface, network.value.type))
      else failed(t('nav.network'))
      if (reboot.status === 'fulfilled') add(t(reboot.value ? 'ready.reboot' : 'ready.noReboot'), reboot.value)
      else failed(t('app.rebootPending'))
      setChecks(rows)
      setDate(new Date().toLocaleString(lang))
    } catch (error) {
      console.error('[Pkaizen] Gaming readiness:', error)
      toast(String(error), 'error')
    } finally { setBusy(false) }
  }
  const open = (url: string): void => { void window.api.openExternal(url).catch((error) => toast(String(error), 'error')) }
  return <>
    <h1>{t('ready.title')}</h1>
    {lang !== 'en' && lang !== 'fr' && <p className="banner info">{t('features.language')}</p>}
    <p className="subtitle">{t('ready.intro')}</p>
    <div className="toolbar">
      <button className="btn primary" disabled={busy} onClick={() => void scan()}>{busy && <span className="spinner" />} {t('ready.scan')}</button>
      {date && <span className="muted">{date}</span>}
    </div>
    {checks.map((check, index) => <div className={`banner ${check.warn ? 'warn' : 'info'}`} key={index}>{check.text}</div>)}
    <h2>{t('ready.windows')}</h2>
    <div className="toolbar">
      <button className="btn" onClick={() => open('ms-settings:display-advancedgraphics')}>{t('ready.graphics')}</button>
      <button className="btn" onClick={() => open('ms-settings:display-advanced')}>{t('ready.refresh')}</button>
      <button className="btn" onClick={() => open('ms-settings:gaming-gamemode')}>{t('ready.gameMode')}</button>
      <button className="btn" onClick={() => open('ms-settings:gaming-gamedvr')}>{t('ready.capture')}</button>
    </div>
    <p className="card gaming-advice">{t('ready.safety')}</p>
  </>
}
