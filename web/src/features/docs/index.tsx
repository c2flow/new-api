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
import {
  ApiIcon,
  ArrowRight01Icon,
  BookOpen01Icon,
  Rocket01Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { Main } from '@/components/layout'

import { CodeBlock } from './code-block'
import { ToolGuides } from './tool-guides'

type DocumentationContentProps = {
  gatewayUrl: string
  baseUrl: string
}

export function DocumentationContent(props: DocumentationContentProps) {
  const { t } = useTranslation()
  const curlExample = `curl ${props.baseUrl}/chat/completions \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -d '{
    "model": "gpt-4o-mini",
    "messages": [
      {"role": "user", "content": "Hello!"}
    ]
  }'`

  return (
    <div className='mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8'>
      <article className='mx-auto max-w-5xl min-w-0 space-y-16'>
        <section id='quick-start' className='scroll-mt-24'>
          <SectionHeading
            icon={Rocket01Icon}
            title={t('Quick start')}
            description={t('Create a key in the console and keep it secure.')}
          />
          <Link
            to='/keys'
            className='border-border hover:bg-muted/50 group mt-5 inline-flex items-center gap-2 rounded-xl border px-4 py-3 font-medium transition-colors'
          >
            {t('Create an API key')}
            <HugeiconsIcon
              icon={ArrowRight01Icon}
              className='text-muted-foreground transition-transform group-hover:translate-x-0.5'
            />
          </Link>
        </section>

        <section id='first-request' className='scroll-mt-24'>
          <SectionHeading
            icon={ApiIcon}
            title={t('Send your first request')}
            description={`${t(
              'The API is compatible with the OpenAI chat completions format.'
            )} ${t(
              'Send your API key as a Bearer token in the Authorization header.'
            )}`}
          />
          <div className='mt-6'>
            <CodeBlock code={curlExample} label='cURL' />
          </div>
          <p className='text-muted-foreground mt-4 text-sm leading-6'>
            {t(
              'Replace YOUR_API_KEY and the model name with values available in your account.'
            )}{' '}
            {t(
              'Treat API keys like passwords. Do not expose them in browser code or public repositories.'
            )}
          </p>
        </section>

        <section id='client-setup' className='scroll-mt-24'>
          <SectionHeading
            icon={BookOpen01Icon}
            title={t('Client configuration')}
            description={t(
              'Use these values in any client that supports OpenAI-compatible services.'
            )}
          />
          <dl className='border-border mt-6 divide-y rounded-xl border'>
            <ConfigRow label={t('API base URL')} value={props.baseUrl} />
            <ConfigRow label={t('API key')} value='YOUR_API_KEY' />
            <ConfigRow
              label={t('Model')}
              value={t('Choose from Model Square')}
            />
          </dl>
        </section>

        <section id='coding-tools' className='scroll-mt-24'>
          <SectionHeading
            icon={ApiIcon}
            title={t('Connect coding assistants')}
            description={t(
              'Use your API key with CC Switch, Codex, Claude Code, OpenCode, Hermes, and DeepSeek Harness.'
            )}
          />
          <p className='text-muted-foreground mt-4 text-sm leading-6'>
            {t(
              'Choose an enabled model from Model Square before configuring a tool.'
            )}
          </p>
          <ToolGuides gatewayUrl={props.gatewayUrl} baseUrl={props.baseUrl} />
        </section>

        <section id='console' className='scroll-mt-24'>
          <SectionHeading
            icon={Rocket01Icon}
            title={t('Manage and troubleshoot')}
            description={t(
              'Use the console to test requests, inspect usage, and resolve common errors.'
            )}
          />
          <div className='mt-6 grid gap-3 sm:grid-cols-2'>
            <ConsoleLink
              to='/playground'
              title={t('Playground')}
              description={t('Test a model before integrating it.')}
            />
            <ConsoleLink
              to='/usage-logs'
              title={t('Usage logs')}
              description={t('Review requests, token usage, and errors.')}
            />
            <ConsoleLink
              to='/keys'
              title={t('API keys')}
              description={t('Create, disable, or rotate access keys.')}
            />
            <ConsoleLink
              to='/wallet'
              title={t('Wallet')}
              description={t('Check balance and recharge records.')}
            />
          </div>
          <div className='border-border bg-muted/30 mt-6 rounded-xl border p-5'>
            <h3 className='font-semibold'>{t('Common checks')}</h3>
            <ul className='text-muted-foreground mt-3 list-disc space-y-2 pl-5 text-sm leading-6'>
              <li>
                {t(
                  'For 401 errors, confirm that the API key is valid and enabled.'
                )}
              </li>
              <li>
                {t(
                  'For 429 errors, check your balance and request rate limits.'
                )}
              </li>
              <li>
                {t(
                  'For model errors, copy an enabled model name from Model Square.'
                )}
              </li>
            </ul>
          </div>
        </section>
      </article>
    </div>
  )
}

function SectionHeading(props: {
  icon: typeof Rocket01Icon
  title: string
  description: string
}) {
  return (
    <div className='flex gap-4'>
      <div className='bg-primary/10 text-primary mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-xl'>
        <HugeiconsIcon icon={props.icon} />
      </div>
      <div>
        <h2 className='text-2xl font-semibold tracking-tight'>{props.title}</h2>
        <p className='text-muted-foreground mt-2 leading-7'>
          {props.description}
        </p>
      </div>
    </div>
  )
}

function ConfigRow(props: { label: string; value: string }) {
  return (
    <div className='grid gap-1 px-4 py-4 sm:grid-cols-[180px_1fr] sm:gap-4'>
      <dt className='text-muted-foreground text-sm'>{props.label}</dt>
      <dd className='font-mono text-sm break-all'>{props.value}</dd>
    </div>
  )
}

function ConsoleLink(props: {
  to: '/playground' | '/usage-logs' | '/keys' | '/wallet'
  title: string
  description: string
}) {
  return (
    <Link
      to={props.to}
      className='border-border hover:bg-muted/50 group rounded-xl border p-4 transition-colors'
    >
      <span className='flex items-center justify-between font-medium'>
        {props.title}
        <HugeiconsIcon
          icon={ArrowRight01Icon}
          className='text-muted-foreground transition-transform group-hover:translate-x-0.5'
        />
      </span>
      <span className='text-muted-foreground mt-1 block text-sm'>
        {props.description}
      </span>
    </Link>
  )
}

export function Documentation() {
  const origin = typeof window === 'undefined' ? '' : window.location.origin

  return (
    <Main id='content' className='overflow-y-auto'>
      <DocumentationContent gatewayUrl={origin} baseUrl={`${origin}/v1`} />
    </Main>
  )
}
