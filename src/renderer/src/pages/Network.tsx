import { useEffect, useState } from 'react'
import type { NetInfo, PingResult, DnsBench, SpeedResult } from '../../../shared/types'
import { useI18n } from '../lib/i18n'
import { useToast } from '../components/Toast'

const pingColor = (ms: number | null): string => {
  if (ms == null) return 'var(--red)'
  if (ms <= 20) return 'var(--green)'
  if (ms <= 50) return 'var(--accent2)'
  if (ms <= 90) return 'var(--orange)'
  return 'var(--red)'
}

export default function Network({ isAdmin }: { isAdmin: boolean }): React.JSX.Element {
  const { t } = useI18n()
  const [info, setInfo] = useState<NetInfo | null>(null)
  const [dnsBusy, setDnsBusy] = useState<string | null>(null)
  const [speed, setSpeed] = useState<SpeedResult | null>(null)
  const [speedBusy, setSpeedBusy] = useState(false)
  const [liveSpeed, setLiveSpeed] = useState<{ phase: 'down' | 'up'; mbps: number; percent: number } | null>(null)
  const [liveDown, setLiveDown] = useState<number | null>(null)
  const [pings, setPings] = useState<PingResult[] | null>(null)
  const [dns, setDns] = useState<DnsBench[] | null>(null)
  const [testing, setTesting] = useState(false)
  const toast = useToast()

  useEffect(() => {
    window.api.getNetInfo().then(setInfo)
    const off = window.api.onSpeedProgress((p) => {
      setLiveSpeed(p)
      if (p.phase === 'down') setLiveDown(p.mbps)
    })
    return off
  }, [])

  const runSpeed = async (): Promise<void> => {
    setSpeedBusy(true)
    setSpeed(null)
    setLiveSpeed(null)
    setLiveDown(null)
    try {
      setSpeed(await window.api.speedTest())
    } catch {
      toast(t('net.error'), 'error')
    }
    setSpeedBusy(false)
    setLiveSpeed(null)
  }

  const runTest = async (): Promise<void> => {
    setTesting(true)
    setPings(null)
    setDns(null)
    try {
      const p = await window.api.pingTest()
      setPings(p)
      const d = await window.api.dnsBench()
      setDns(d)
    } catch {
      toast(t('net.error'), 'error')
    }
    setTesting(false)
  }

  const applyDns = async (preset: string): Promise<void> => {
    setDnsBusy(preset)
    const res = await window.api.setDns(preset)
    toast(res.message || '', res.ok ? 'success' : 'error')
    setDnsBusy(null)
  }

  return (
    <>
      <h1>{t('net.title')}</h1>
      <p className="subtitle">{t('net.subtitle')}</p>

      {info && (
        <div className="grid" style={{ marginBottom: 18 }}>
          <div className="card stagger">
            <h3>{t('net.connection')}</h3>
            <div className="big">{info.type}</div>
            <div className="sub">{info.iface}</div>
          </div>
          {info.speedMbps != null && info.speedMbps > 0 && (
            <div className="card stagger">
              <h3>{t('net.linkSpeed')}</h3>
              <div className="big">{info.speedMbps >= 1000 ? `${info.speedMbps / 1000} Gb/s` : `${info.speedMbps} Mb/s`}</div>
              <div className="sub">{t('net.linkSpeedSub')}</div>
            </div>
          )}
        </div>
      )}

      {info?.type === 'Wi-Fi' && <div className="banner warn">{t('net.wifiWarn')}</div>}

      <div className="section-title">{t('net.speedSection')}</div>
      <div className="toolbar">
        <button className="btn primary" disabled={speedBusy} onClick={runSpeed}>
          {speedBusy ? <span className="spinner" /> : '🚀'} {t('net.speedRun')}
        </button>
        {speedBusy && liveSpeed && (
          <span className="muted">
            {liveSpeed.phase === 'down' ? '⬇' : '⬆'} {liveSpeed.mbps} Mbps… ({liveSpeed.percent}%)
          </span>
        )}
      </div>
      {(speed || (speedBusy && liveSpeed)) && (
        <div className="grid" style={{ marginBottom: 14 }}>
          <div className="card stagger">
            <h3>⬇ {t('net.down')}</h3>
            <div className="score-num" style={{ fontSize: 42 }}>
              {speed?.downMbps ?? liveDown ?? '…'}
            </div>
            <div className="sub">Mbps</div>
          </div>
          <div className="card stagger">
            <h3>⬆ {t('net.up')}</h3>
            <div className="score-num" style={{ fontSize: 42 }}>
              {speed?.upMbps ?? (liveSpeed?.phase === 'up' ? liveSpeed.mbps : '…')}
            </div>
            <div className="sub">Mbps</div>
          </div>
        </div>
      )}
      {speed && speed.downMbps != null && (
        <>
          <div
            className={`banner ${speed.downMbps >= 100 ? 'ok' : speed.downMbps >= 25 ? 'info' : 'warn'}`}
          >
            {speed.downMbps >= 100
              ? t('net.vExcellent', speed.downMbps, speed.upMbps ?? '?')
              : speed.downMbps >= 25
                ? t('net.vGood', speed.downMbps, speed.upMbps ?? '?')
                : t('net.vWeak', speed.downMbps, speed.upMbps ?? '?')}
          </div>
          {speed.upMbps != null && speed.upMbps < 10 && <div className="banner warn">{t('net.vUploadLow', speed.upMbps)}</div>}
          <div className="banner info">{t('net.speedNote')}</div>
        </>
      )}

      <div className="toolbar">
        <button className="btn primary" disabled={testing} onClick={runTest}>
          {testing ? <span className="spinner" /> : '📡'} {t('net.runTest')}
        </button>
      </div>

      {pings && (
        <>
          <div className="section-title">{t('net.latency')}</div>
          {pings.map((p) => (
            <div className="row stagger" key={p.host} style={{ borderLeft: `3px solid ${pingColor(p.avgMs)}` }}>
              <div className="row-info">
                <div className="row-title">{p.label}</div>
                <div className="row-desc">
                  {p.avgMs == null
                    ? t('net.unreachable')
                    : `min ${p.minMs} ms · max ${p.maxMs} ms · jitter ${p.jitterMs} ms${p.loss > 0 ? ` · ${p.loss}% ${t('net.loss')} ⚠` : ''}`}
                </div>
              </div>
              <div className="big" style={{ color: pingColor(p.avgMs), whiteSpace: 'nowrap' }}>
                {p.avgMs == null ? '—' : `${p.avgMs} ms`}
              </div>
            </div>
          ))}
          {pings.some((p) => (p.jitterMs ?? 0) > 15) && <div className="banner warn">{t('net.jitterWarn')}</div>}
        </>
      )}

      {dns && (
        <>
          <div className="section-title">{t('net.dns')}</div>
          {dns.map((d) => {
            const best = Math.min(...dns.filter((x) => x.ms != null).map((x) => x.ms!))
            return (
              <div className="row stagger" key={d.server}>
                <div className="row-info">
                  <div className="row-title">
                    {d.server}
                    {d.ms != null && d.ms === best && <span className="badge okay">{t('net.fastest')}</span>}
                  </div>
                </div>
                <div className="big" style={{ whiteSpace: 'nowrap' }}>{d.ms == null ? '—' : `${d.ms} ms`}</div>
              </div>
            )
          })}
          <div className="banner info">{t('net.dnsTip')}</div>

          <div className="section-title">{t('net.oneClick')}</div>
          {!isAdmin && <div className="banner warn">{t('net.dnsAdmin')}</div>}
          <div className="toolbar">
            {[
              { preset: 'cloudflare', label: 'Cloudflare (1.1.1.1)' },
              { preset: 'google', label: 'Google (8.8.8.8)' },
              { preset: 'quad9', label: 'Quad9 (9.9.9.9)' }
            ].map((d) => (
              <button
                key={d.preset}
                className="btn primary"
                disabled={dnsBusy != null || !isAdmin}
                onClick={() => applyDns(d.preset)}
              >
                {dnsBusy === d.preset ? <span className="spinner" /> : '⚡'} {t('net.dnsSet', d.label)}
              </button>
            ))}
            <button className="btn" disabled={dnsBusy != null || !isAdmin} onClick={() => applyDns('auto')}>
              {dnsBusy === 'auto' ? <span className="spinner" /> : '↺'} {t('net.dnsAuto')}
            </button>
          </div>
        </>
      )}
    </>
  )
}
