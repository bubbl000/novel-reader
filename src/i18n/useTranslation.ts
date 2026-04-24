import { useMangaStore } from '../stores/mangaStore'
import { translations, Language } from './translations'

function getNestedValue(obj: Record<string, unknown>, path: string): Record<string, string> | undefined {
  const keys = path.split('.')
  let current: unknown = obj
  for (const key of keys) {
    if (current == null || typeof current !== 'object') return undefined
    current = (current as Record<string, unknown>)[key]
  }
  if (current != null && typeof current === 'object') {
    return current as Record<string, string>
  }
  return undefined
}

export function t(key: string, lang?: Language, params?: Record<string, string | number>): string {
  const language = lang || useMangaStore.getState().language || 'zh'
  const value = getNestedValue(translations as unknown as Record<string, unknown>, key)
  if (!value) return key
  let text: string = value[language] || value['zh'] || key
  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      text = text.replace(`{${k}}`, String(v))
    })
  }
  return text
}

export function useTranslation() {
  const language = useMangaStore((s) => s.language)

  const translate = (key: string, params?: Record<string, string | number>): string => {
    const value = getNestedValue(translations as unknown as Record<string, unknown>, key)
    if (!value) return key
    let text: string = value[language] || value['zh'] || key
    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        text = text.replace(`{${k}}`, String(v))
      })
    }
    return text
  }

  return { t: translate, language }
}
