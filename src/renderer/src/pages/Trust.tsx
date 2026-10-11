import { useI18n } from '../lib/i18n'
import { useToast } from '../components/Toast'

export default function Trust(): React.JSX.Element {
  const { t, lang } = useI18n()
  const toast = useToast()
  const open = (path: string): void => {
    void window.api.openExternal(`https://github.com/sh1wyn/pkaizen-forge${path}`).catch((error) => toast(String(error), 'error'))
  }
  return <>
    <h1>{t('trust.title')}</h1>
    {lang !== 'en' && lang !== 'fr' && <p className="banner info">{t('features.language')}</p>}
    <p className="subtitle">{t('trust.intro')}</p>
    <div className="toolbar">
      <button className="btn primary" onClick={() => open('')}>{t('trust.source')}</button>
      <button className="btn" onClick={() => open('/blob/HEAD/LICENSE')}>{t('trust.license')}</button>
      <button className="btn" onClick={() => open('/releases')}>{t('trust.releases')}</button>
    </div>
    <div className="card gaming-block">
      <h2>{t('trust.verify')}</h2>
      <p>{t('trust.steps')}</p>
      <p>{t('trust.command')}</p>
      <pre className="verification-command">Get-FileHash .\Pkaizen-Forge-Setup.exe -Algorithm SHA256</pre>
    </div>
    <div className="card gaming-block"><h2>{t('trust.privacy')}</h2><p>{t('trust.data')}</p></div>
    <div className="card gaming-block"><h2>{t('trust.limits')}</h2><p>{t('trust.compat')}</p></div>
    <p className="banner warn">{t('trust.unsigned')}</p>
    <button className="btn" onClick={() => open('/issues')}>{t('trust.report')}</button>
  </>
}
