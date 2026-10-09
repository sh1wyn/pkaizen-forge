export type Lang = 'en' | 'fr' | 'es' | 'ru' | 'de' | 'pt' | 'it'

export let currentLang: Lang = 'en'

const VALID: Lang[] = ['en', 'fr', 'es', 'ru', 'de', 'pt', 'it']

export function setLang(l: Lang): void {
  currentLang = VALID.includes(l) ? l : 'en'
}

/** Résout un texte selon la langue courante (français natif, sinon anglais international). */
export const T = (en: string, fr: string): string => (currentLang === 'fr' ? fr : en)
