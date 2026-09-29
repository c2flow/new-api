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
import { useLocation } from '@tanstack/react-router'
import { Check, Copy, LoaderCircle, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { getUserLogs } from '@/features/usage-logs/api'
import { useCopyToClipboard } from '@/hooks/use-copy-to-clipboard'
import { ROLE } from '@/lib/roles'
import { useAuthStore } from '@/stores/auth-store'

import { ADMIN_TRACK, ORGANIZATION_STEPS, QUICKSTART_TRACK } from '../data'
import {
  readTutorialSession,
  TUTORIAL_API_KEY_COPIED_EVENT,
  TUTORIAL_API_KEY_CREATED_EVENT,
  TUTORIAL_SESSION_EVENT,
  type TutorialSession,
  writeTutorialSession,
} from '../session'
import type { TutorialStep } from '../types'

type HighlightRect = {
  top: number
  left: number
  width: number
  height: number
}

const PADDING = 8
const COACH_GAP = 16
const VIEWPORT_MARGIN = 12

function getCoachPosition(
  target: HighlightRect,
  coachHeight: number,
  viewportHeight: number
) {
  const targetBottom = target.top + target.height
  const spaceAbove = target.top - COACH_GAP - VIEWPORT_MARGIN
  const spaceBelow = viewportHeight - targetBottom - COACH_GAP - VIEWPORT_MARGIN
  const placeBelow =
    spaceBelow >= coachHeight || (spaceBelow >= spaceAbove && spaceBelow > 0)
  const availableSpace = Math.max(placeBelow ? spaceBelow : spaceAbove, 0)

  return {
    top: placeBelow
      ? targetBottom + COACH_GAP
      : Math.max(target.top - COACH_GAP - coachHeight, VIEWPORT_MARGIN),
    maxHeight: availableSpace,
  }
}

function getTutorialSteps(session: TutorialSession): TutorialStep[] {
  if (session.trackID === 'organization') {
    return ORGANIZATION_STEPS[session.organizationRole ?? 'owner']
  }
  if (session.trackID === 'admin') return ADMIN_TRACK.steps
  return QUICKSTART_TRACK.steps
}

export function TutorialCoach() {
  const { t } = useTranslation()
  const pathname = useLocation({ select: (location) => location.pathname })
  const user = useAuthStore((state) => state.auth.user)
  const { copiedText, copyToClipboard } = useCopyToClipboard({ notify: false })
  const [session, setSession] = useState<TutorialSession | null>(() =>
    readTutorialSession()
  )
  const [rect, setRect] = useState<HighlightRect | null>(null)
  const [apiKey, setApiKey] = useState('')
  const [coachHeight, setCoachHeight] = useState(0)
  const coachRef = useRef<HTMLElement>(null)

  useEffect(() => {
    const updateSession = () => setSession(readTutorialSession())
    window.addEventListener(TUTORIAL_SESSION_EVENT, updateSession)
    return () =>
      window.removeEventListener(TUTORIAL_SESSION_EVENT, updateSession)
  }, [])

  const close = useCallback(() => {
    writeTutorialSession(null)
    setSession(null)
    setRect(null)
    setApiKey('')
  }, [])

  const steps = session ? getTutorialSteps(session) : []
  const step = session ? steps[session.stepIndex] : undefined

  const completeStep = useCallback(
    (updates?: Partial<TutorialSession>) => {
      if (!session) return
      if (session.stepIndex >= steps.length - 1) {
        close()
        return
      }
      const next = {
        ...session,
        ...updates,
        stepIndex: session.stepIndex + 1,
      }
      writeTutorialSession(next)
      setSession(next)
      setRect(null)
    },
    [close, session, steps.length]
  )

  useEffect(() => {
    if (!session || !step) return
    if (
      session.trackID === 'admin' &&
      (user?.role ?? ROLE.GUEST) < ROLE.ADMIN
    ) {
      close()
    }
  }, [close, session, step, user?.role])

  useEffect(() => {
    if (!session || !step || step.advanceOn !== 'request-log') return
    let cancelled = false
    const checkForRequest = async () => {
      try {
        const response = await getUserLogs({
          p: 1,
          page_size: 1,
          start_timestamp: session.requestStartedAt,
        })
        if (!cancelled && (response.data?.items.length ?? 0) > 0) {
          completeStep()
        }
      } catch {
        // Keep waiting while the request is running or the network recovers.
      }
    }
    void checkForRequest()
    const timer = window.setInterval(checkForRequest, 2000)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [completeStep, session, step])

  useEffect(() => {
    if (!step) return
    let eventName: string | null = null
    if (step.advanceOn === 'api-key-created') {
      eventName = TUTORIAL_API_KEY_CREATED_EVENT
    } else if (step.advanceOn === 'api-key-copied') {
      eventName = TUTORIAL_API_KEY_COPIED_EVENT
    }
    if (!eventName) return
    const handleEvent = () => completeStep()
    window.addEventListener(eventName, handleEvent)
    return () => window.removeEventListener(eventName, handleEvent)
  }, [completeStep, step])

  useEffect(() => {
    const coach = coachRef.current
    if (!coach) return
    const updateCoachHeight = () =>
      setCoachHeight(coach.getBoundingClientRect().height)
    updateCoachHeight()
    const observer = new ResizeObserver(updateCoachHeight)
    observer.observe(coach)
    return () => observer.disconnect()
  }, [step])

  useEffect(() => {
    if (!step) {
      setRect(null)
      return
    }

    const currentPath = pathname.replace(/\/$/, '') || '/'
    const stepPath = step.href.replace(/\/$/, '') || '/'
    const isOnStepPage = currentPath === stepPath
    let target: HTMLElement | null = null
    let observer: ResizeObserver | null = null
    let timeout: number | null = null
    let attempts = 0

    const updateRect = () => {
      if (!target) return
      const bounds = target.getBoundingClientRect()
      setRect({
        top: Math.max(bounds.top - PADDING, 0),
        left: Math.max(bounds.left - PADDING, 0),
        width: Math.min(
          bounds.width + PADDING * 2,
          window.innerWidth - Math.max(bounds.left - PADDING, 0)
        ),
        height: Math.min(
          bounds.height + PADDING * 2,
          window.innerHeight - Math.max(bounds.top - PADDING, 0)
        ),
      })
    }

    const handleAction = (event: Event) => {
      if (
        step.advanceOn === 'api-key-created' ||
        step.advanceOn === 'api-key-copied' ||
        step.advanceOn === 'paste-api-key' ||
        step.advanceOn === 'copy-curl' ||
        step.advanceOn === 'request-log'
      ) {
        return
      }
      if (step.advanceOn === 'input') {
        const input = event.target as HTMLInputElement
        if (input.value.trim().length < (step.minimumInputLength ?? 1)) return
      }
      completeStep()
    }

    const findTarget = () => {
      const selector = isOnStepPage
        ? step.target
        : `a[href="${step.href}"], a[href="${step.href}/"]`
      target = document.querySelector<HTMLElement>(selector)
      if (!target && attempts < 100) {
        attempts += 1
        timeout = window.setTimeout(findTarget, 100)
        return
      }
      if (!target) return
      target.scrollIntoView({ block: 'center', behavior: 'smooth' })
      updateRect()
      observer = new ResizeObserver(updateRect)
      observer.observe(target)
      if (isOnStepPage) {
        target.addEventListener(
          step.advanceOn === 'input' ? (step.inputEvent ?? 'input') : 'click',
          handleAction
        )
      }
    }

    findTarget()
    window.addEventListener('resize', updateRect)
    window.addEventListener('scroll', updateRect, true)
    return () => {
      if (timeout !== null) window.clearTimeout(timeout)
      observer?.disconnect()
      if (target && isOnStepPage) {
        target.removeEventListener(
          step.advanceOn === 'input' ? (step.inputEvent ?? 'input') : 'click',
          handleAction
        )
      }
      window.removeEventListener('resize', updateRect)
      window.removeEventListener('scroll', updateRect, true)
    }
  }, [completeStep, pathname, step])

  if (!session || !step) return null

  const curlCommand = `curl ${window.location.origin}/v1/chat/completions -H "Authorization: Bearer ${apiKey || 'YOUR_API_KEY'}" -H "Content-Type: application/json" -d '{"model":"gpt-4o-mini","messages":[{"role":"user","content":"Hello"}]}'`
  const showCurlEditor = step.code === 'curl-key' || step.code === 'curl-copy'
  const coachPosition =
    rect && coachHeight > 0
      ? getCoachPosition(rect, coachHeight, window.innerHeight)
      : null

  return (
    <div aria-live='polite'>
      {rect && (
        <>
          <div
            className='fixed inset-x-0 top-0 z-50 bg-black/55'
            style={{ height: rect.top }}
          />
          <div
            className='fixed left-0 z-50 bg-black/55'
            style={{ top: rect.top, width: rect.left, height: rect.height }}
          />
          <div
            className='fixed right-0 z-50 bg-black/55'
            style={{
              top: rect.top,
              left: rect.left + rect.width,
              height: rect.height,
            }}
          />
          <div
            className='fixed inset-x-0 bottom-0 z-50 bg-black/55'
            style={{ top: rect.top + rect.height }}
          />
          <div
            data-testid='tutorial-highlight'
            className='ring-offset-background pointer-events-none fixed z-50 rounded-lg ring-4 ring-blue-500 ring-offset-2'
            style={rect}
          />
        </>
      )}
      <section
        ref={coachRef}
        role='dialog'
        aria-label={t('Usage tutorial')}
        className='bg-background border-border fixed right-3 left-3 z-[60] overflow-y-auto rounded-lg border p-4 shadow-xl sm:right-auto sm:left-4 sm:w-[390px]'
        style={
          coachPosition
            ? {
                top: coachPosition.top,
                bottom: 'auto',
                maxHeight: coachPosition.maxHeight,
                left: window.innerWidth >= 640 ? VIEWPORT_MARGIN : undefined,
              }
            : { bottom: VIEWPORT_MARGIN }
        }
      >
        <div className='flex items-start justify-between gap-3'>
          <div className='min-w-0'>
            <p className='text-muted-foreground text-xs font-medium'>
              {t('Step {{current}} of {{total}}', {
                current: session.stepIndex + 1,
                total: steps.length,
              })}
            </p>
            <h2 className='mt-1 font-semibold'>{t(step.titleKey)}</h2>
          </div>
          <Button
            variant='ghost'
            size='icon-sm'
            onClick={close}
            aria-label={t('Close')}
          >
            <X />
          </Button>
        </div>
        <p className='text-muted-foreground mt-2 text-sm leading-5'>
          {t(step.descriptionKey)}
        </p>

        {showCurlEditor && (
          <div className='mt-3 space-y-3'>
            <Input
              data-tutorial='curl-key-input'
              type='password'
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value.trim())}
              onPaste={(event) => {
                if (step.advanceOn !== 'paste-api-key') return
                event.preventDefault()
                const pastedText = event.clipboardData.getData('text').trim()
                const pastedKey = pastedText.split(/\s+/).at(-1) ?? ''
                setApiKey(pastedKey)
                if (pastedKey.length >= 16) completeStep()
              }}
              placeholder={t('Paste your API key here')}
              aria-label={t('API key')}
            />
            <div className='bg-muted rounded-md p-3'>
              <code className='block max-h-28 overflow-auto text-xs leading-5 break-all'>
                {curlCommand}
              </code>
              {step.code === 'curl-copy' && (
                <Button
                  data-tutorial='curl-copy'
                  className='mt-2'
                  variant='outline'
                  size='sm'
                  disabled={!apiKey}
                  onClick={async () => {
                    if (await copyToClipboard(curlCommand)) {
                      completeStep({
                        requestStartedAt: Math.floor(Date.now() / 1000),
                      })
                    }
                  }}
                >
                  {copiedText === curlCommand ? <Check /> : <Copy />}
                  {t('Copy the curl command')}
                </Button>
              )}
            </div>
          </div>
        )}

        {step.code === 'curl-wait' && (
          <div className='text-muted-foreground mt-3 flex items-center gap-2 text-xs'>
            <LoaderCircle className='size-4 animate-spin' />
            {t('Waiting for the API request...')}
          </div>
        )}
      </section>
    </div>
  )
}
