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
  Key01Icon,
  Rocket01Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { Main } from '@/components/layout'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { useStatus } from '@/hooks/use-status'

import { CodeBlock } from './code-block'
import { ToolGuides } from './tool-guides'

const sections = [
  ['quick-start', 'Quick start'],
  ['authentication', 'Authentication'],
  ['first-request', 'Send your first request'],
  ['client-setup', 'Client configuration'],
  ['coding-tools', 'Coding tools'],
  ['console', 'Manage and troubleshoot'],
] as const

const quickSteps = [
  [
    '01',
    'Create an API key',
    'Create a key in the console and keep it secure.',
  ],
  [
    '02',
    'Choose a model',
    'Browse enabled models and copy the exact model name.',
  ],
  ['03', 'Make a request', 'Use the OpenAI-compatible endpoint with your key.'],
] as const

type DocumentationContentProps = {
  gatewayUrl: string
  baseUrl: string
  externalDocsUrl?: string
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
      <header className='border-border/70 bg-muted/20 relative overflow-hidden rounded-3xl border px-6 py-12 sm:px-10 sm:py-16'>
        <Badge variant='secondary' className='mb-5'>
          <HugeiconsIcon icon={BookOpen01Icon} />
          {t('User guide')}
        </Badge>
        <h1 className='max-w-3xl text-4xl font-bold tracking-tight sm:text-5xl'>
          {t('Connect to AI models in minutes')}
        </h1>
        <p className='text-muted-foreground mt-5 max-w-2xl text-base leading-7 sm:text-lg'>
          {t(
            'Follow this guide to create a key, choose a model, and send your first API request.'
          )}
        </p>
        <div className='mt-8 flex flex-wrap gap-3'>
          <Button size='lg' render={<Link to='/keys' />}>
            <HugeiconsIcon icon={Key01Icon} />
            {t('Create an API key')}
          </Button>
          <Button variant='outline' size='lg' render={<Link to='/pricing' />}>
            {t('Browse models')}
            <HugeiconsIcon icon={ArrowRight01Icon} />
          </Button>
        </div>
      </header>

      <div className='mt-10 grid items-start gap-10 lg:grid-cols-[220px_minmax(0,1fr)]'>
        <aside className='sticky top-4 hidden lg:block'>
          <p className='mb-3 text-sm font-semibold'>{t('On this page')}</p>
          <nav aria-label={t('Documentation sections')}>
            <ul className='border-border space-y-1 border-l'>
              {sections.map(([id, title]) => (
                <li key={id}>
                  <a
                    href={`#${id}`}
                    className='text-muted-foreground hover:text-foreground block border-l border-transparent px-4 py-1.5 text-sm transition-colors hover:border-current'
                  >
                    {t(title)}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </aside>

        <article className='min-w-0 space-y-16'>
          <section id='quick-start' className='scroll-mt-24'>
            <SectionHeading
              icon={Rocket01Icon}
              title={t('Quick start')}
              description={t(
                'Three steps are all you need to start using the API.'
              )}
            />
            <div className='mt-6 grid gap-4 md:grid-cols-3'>
              {quickSteps.map(([number, title, description]) => (
                <Card key={number} className='h-full'>
                  <CardContent className='pt-1'>
                    <span className='text-primary text-xs font-semibold'>
                      {number}
                    </span>
                    <h3 className='mt-3 font-semibold'>{t(title)}</h3>
                    <p className='text-muted-foreground mt-2 text-sm leading-6'>
                      {t(description)}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>

          <section id='authentication' className='scroll-mt-24'>
            <SectionHeading
              icon={Key01Icon}
              title={t('Authentication')}
              description={t(
                'Send your API key as a Bearer token in the Authorization header.'
              )}
            />
            <div className='bg-muted/40 mt-6 rounded-xl p-4 font-mono text-sm'>
              Authorization: Bearer YOUR_API_KEY
            </div>
            <p className='text-muted-foreground mt-4 text-sm leading-6'>
              {t(
                'Treat API keys like passwords. Do not expose them in browser code or public repositories.'
              )}
            </p>
          </section>

          <section id='first-request' className='scroll-mt-24'>
            <SectionHeading
              icon={ApiIcon}
              title={t('Send your first request')}
              description={t(
                'The API is compatible with the OpenAI chat completions format.'
              )}
            />
            <div className='mt-6'>
              <CodeBlock code={curlExample} label='cURL' />
            </div>
            <p className='text-muted-foreground mt-4 text-sm leading-6'>
              {t(
                'Replace YOUR_API_KEY and the model name with values available in your account.'
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
                'Use your API key with CC Switch, Codex, Claude Code, and OpenCode.'
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
            {props.externalDocsUrl && (
              <p className='text-muted-foreground mt-6 text-sm'>
                {t('Need more details?')}{' '}
                <a
                  href={props.externalDocsUrl}
                  target='_blank'
                  rel='noopener noreferrer'
                  className='text-foreground font-medium underline underline-offset-4'
                >
                  {t('Open the extended documentation')}
                </a>
              </p>
            )}
          </section>
        </article>
      </div>
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
  const { status } = useStatus()
  const configuredDocsUrl = status?.docs_link
  const externalDocsUrl =
    typeof configuredDocsUrl === 'string' &&
    /^https?:\/\//.test(configuredDocsUrl)
      ? configuredDocsUrl
      : undefined
  const origin = typeof window === 'undefined' ? '' : window.location.origin

  return (
    <Main id='content' className='overflow-y-auto'>
      <DocumentationContent
        gatewayUrl={origin}
        baseUrl={`${origin}/v1`}
        externalDocsUrl={externalDocsUrl}
      />
    </Main>
  )
}
