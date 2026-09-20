/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import i18next from 'i18next'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

beforeEach(() => {
  vi.resetModules()
  // The shared test setup seeds English resources; restore an unconfigured app startup.
  i18next.options.lng = undefined
  i18next.options.resources = undefined
  localStorage.clear()
  vi.stubGlobal('navigator', { languages: ['zh-CN'], language: 'zh-CN' })
})

afterEach(() => {
  localStorage.clear()
  vi.unstubAllGlobals()
})

describe('on-demand interface translations', () => {
  it.each(['zh-CN', 'zh', 'zhCN'])(
    '%s starts with only simplified Chinese loaded',
    async (language) => {
      localStorage.setItem('i18nextLng', language)
      const { default: i18n, i18nReady } = await import('../config')
      await i18nReady

      expect(i18n.resolvedLanguage).toBe('zhCN')
      expect(i18n.t('Loading...')).toBe('加载中...')
      expect(Object.keys(i18n.store.data)).toEqual(['zhCN'])
    }
  )

  it('uses Chinese when the browser language is unsupported', async () => {
    vi.stubGlobal('navigator', { languages: ['de-DE'], language: 'de-DE' })
    const { default: i18n, i18nReady } = await import('../config')
    await i18nReady

    expect(i18n.resolvedLanguage).toBe('zhCN')
    expect(Object.keys(i18n.store.data)).toEqual(['zhCN'])
  })

  it.each(['en', 'fr', 'ja', 'ru', 'vi', 'zhTW'])(
    'restores saved %s with only that language and Chinese fallback',
    async (language) => {
      localStorage.setItem('i18nextLng', language)
      const { default: i18n, i18nReady } = await import('../config')
      await i18nReady

      expect(i18n.resolvedLanguage).toBe(language)
      expect(Object.keys(i18n.store.data).sort()).toEqual(
        [language, 'zhCN'].sort()
      )
      expect(i18n.t('Loading...')).toBe(
        i18n.getResource(language, 'translation', 'Loading...')
      )
    }
  )

  it('loads English on selection and keeps Chinese as the missing-key fallback', async () => {
    const { default: i18n, i18nReady } = await import('../config')
    await i18nReady
    expect(i18n.hasResourceBundle('en', 'translation')).toBe(false)

    await i18n.changeLanguage('en')
    expect(i18n.t('Loading...')).toBe('Loading...')
    expect(localStorage.getItem('i18nextLng')).toBe('en')
    expect(Object.keys(i18n.store.data).sort()).toEqual(['en', 'zhCN'])

    // A key absent from the selected language must use the Chinese translation.
    const english = i18n.getResourceBundle('en', 'translation')
    delete english['Loading...']
    expect(i18n.t('Loading...')).toBe('加载中...')

    await i18n.changeLanguage('zhCN')
    expect(i18n.t('Loading...')).toBe('加载中...')
    expect(localStorage.getItem('i18nextLng')).toBe('zhCN')
  })
})
