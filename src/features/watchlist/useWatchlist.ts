import { useEffect, useState } from 'react'
import type { ApiResponse, Company, QuoteItem } from '../../../shared/api'
import { request, useResource } from '../../data/api'
import {
  defaultPreferences,
  parsePreferences,
  STORAGE_KEY,
  type Preferences,
} from './model'

export function useCompanySearch(
  query: string,
  composing: boolean,
  revision: number,
) {
  const text = query.trim()
  const key = `${text}:${revision}`
  const [state, setState] = useState<{
    key: string
    response?: ApiResponse<Company[]>
    error?: string
  }>()
  useEffect(() => {
    if (!text || composing) return
    const controller = new AbortController()
    const timer = setTimeout(() => {
      void request<Company[]>(
        `/api/companies?q=${encodeURIComponent(text)}`,
        controller.signal,
      ).then(
        (response) => {
          if (!controller.signal.aborted) setState({ key, response })
        },
        () => {
          if (!controller.signal.aborted)
            setState({ key, error: '搜索暂不可用，请重试' })
        },
      )
    }, 250)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [text, key, composing])
  const current = !composing && text && state?.key === key ? state : undefined
  return {
    response: current?.response,
    error: current?.error,
    loading: !!text && !composing && !current,
  }
}
export function useQuotes(codes: string[], revision: number) {
  return useResource<QuoteItem[]>(
    codes.length ? `/api/quotes?codes=${codes.join(',')}` : null,
    revision,
  )
}
export function usePreferences() {
  const [initial] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      return {
        preferences: saved ? parsePreferences(saved) : defaultPreferences,
        error: '',
      }
    } catch {
      return {
        preferences: defaultPreferences,
        error: '无法读取本地设置，当前使用默认设置；原记录未被覆盖。',
      }
    }
  })
  const [preferences, setPreferences] = useState(initial.preferences)
  const [storageError, setStorageError] = useState(initial.error)
  function update(next: Preferences) {
    setPreferences(next)
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      setStorageError('')
    } catch {
      setStorageError('本地保存失败，本次修改仅在当前页面有效。')
    }
  }
  return { preferences, update, storageError }
}
