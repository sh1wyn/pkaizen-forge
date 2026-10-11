import { useState } from 'react'
import type { SystemReport } from '../../../shared/types'
import { useI18n } from '../lib/i18n'
import { useToast } from './Toast'

export default function BenchmarkReferences({ disabled }: { disabled: boolean }): React.JSX.Element {
  const { t } = useI18n()
  const toast = useToast()
  const [report, setReport] = useState<SystemReport | null>(null)
  const [busy, setBusy] = useState(false)
  const scan = async (): Promise<void> => {
    setBusy(true)
    try { setReport(await window.api.getSystemReport()) } catch (error) { toast(String(error), 'error') }
    finally { setBusy(false) }
  }
  const open = (url: string): void => { void window.api.openExternal(url).catch((error) => toast(String(error), 'error')) }
  return <section className="card gaming-block">
    <h2>{t('forge.references')}</h2>
    <p>{t('forge.referenceIntro')}</p>
    <button className="btn" disabled={disabled || busy} onClick={() => void scan()}>
      {busy && <span className="spinner" />} {t('forge.config')}
    </button>
    {report && <div className="gaming-advice">
      <p>{report.cpu.brand} · {report.ram.totalGB} GB RAM · {report.isLaptop ? t('dash.laptop') : t('dash.desktop')}</p>
      {report.gpus.map((gpu, index) => <p key={index}>{gpu.model} · {gpu.vramMB > 0 ? `${gpu.vramMB} MB VRAM` : t('ready.unknown')}</p>)}
    </div>}
    <div className="toolbar">
      <button className="btn" onClick={() => open('https://www.techpowerup.com/review/')}>TechPowerUp</button>
      <button className="btn" onClick={() => open('https://www.computerbase.de/thema/grafikkarte/rangliste/')}>ComputerBase</button>
      <button className="btn" onClick={() => open('https://www.notebookcheck.net/Computer-Games-on-Laptop-Graphics-Cards.13849.0.html')}>Notebookcheck</button>
    </div>
    <p className="sub">{t('forge.sourceNote')}</p>
    <p className="sub">{t('forge.referenceTools')}</p>
    <div className="toolbar">
      <button className="btn" onClick={() => open('https://www.maxon.net/en/downloads/cinebench')}>Cinebench</button>
      <button className="btn" onClick={() => open('https://benchmarks.ul.com/3dmark')}>3DMark</button>
      <button className="btn" onClick={() => open('https://crystalmark.info/en/software/crystaldiskmark/')}>CrystalDiskMark</button>
    </div>
  </section>
}
