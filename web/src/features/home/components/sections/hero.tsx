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
import DeepSeekColor from '@lobehub/icons/es/DeepSeek/components/Color'
import HermesAgent from '@lobehub/icons/es/HermesAgent/components/Mono'
import { Link } from '@tanstack/react-router'
import { ArrowRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface HeroProps {
  siteName: string
  isAuthenticated: boolean
}

export function Hero(props: HeroProps) {
  const { t } = useTranslation()

  return (
    <main className='mx-auto flex w-full max-w-6xl flex-1 flex-col px-6 pt-32 sm:px-8 sm:pt-[25svh]'>
      <section
        aria-labelledby='home-title'
        className='flex flex-col items-center text-center'
      >
        <p className='text-muted-foreground text-xs font-semibold tracking-[0.24em]'>
          {props.siteName}
        </p>
        <h1
          id='home-title'
          className='mt-8 text-4xl leading-tight font-bold tracking-tight text-balance sm:mt-10 sm:text-6xl lg:text-7xl'
        >
          {t('AI within reach')}
        </h1>
        <p className='text-muted-foreground mt-6 max-w-2xl text-base leading-relaxed text-balance sm:text-2xl'>
          {t('Start here with the AI models you need')}
        </p>
        <div className='mt-10 flex flex-wrap items-center justify-center gap-3 sm:mt-12 sm:gap-6'>
          <Link
            to={props.isAuthenticated ? '/dashboard' : '/sign-in'}
            search={
              props.isAuthenticated ? undefined : { redirect: '/dashboard' }
            }
            className={cn(
              buttonVariants(),
              'h-12 gap-3 rounded-full bg-blue-600 px-8 text-base text-white hover:bg-blue-700'
            )}
          >
            {t('Enter Console')}
            <ArrowRight aria-hidden='true' className='size-4' />
          </Link>
          <Link
            to='/pricing'
            className={cn(
              buttonVariants({ variant: 'ghost' }),
              'h-12 gap-3 rounded-full px-5 text-base text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300'
            )}
          >
            {t('Browse Models')}
            <ArrowRight aria-hidden='true' className='size-4' />
          </Link>
        </div>
      </section>
      <section
        aria-labelledby='home-tools'
        className='border-border/60 mt-16 border-t pt-10 pb-12 text-center sm:mt-24 sm:pt-12'
      >
        <h2
          id='home-tools'
          className='text-muted-foreground text-sm font-medium'
        >
          {t('Everyday Tools')}
        </h2>
        <div className='mt-8 inline-grid grid-cols-1 items-center gap-y-3 sm:auto-cols-fr sm:grid-flow-col sm:grid-cols-none sm:gap-x-8'>
          <a
            href='https://hermes-agent.nousresearch.com/'
            target='_blank'
            rel='noopener noreferrer'
            className='hover:bg-muted focus-visible:ring-ring inline-flex min-h-11 items-center justify-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none sm:text-base'
          >
            <HermesAgent size={28} aria-hidden='true' />
            {t('Hermes Agent')}
          </a>
          <a
            href='https://deepseek.com/harness/'
            target='_blank'
            rel='noopener noreferrer'
            className='hover:bg-muted focus-visible:ring-ring inline-flex min-h-11 items-center justify-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none sm:text-base'
          >
            <DeepSeekColor size={28} aria-hidden='true' />
            DeepSeek Harness
          </a>
        </div>
      </section>
    </main>
  )
}
