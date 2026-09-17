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
import { Copy01Icon, Tick02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'

type CodeBlockProps = {
  code: string
  label: string
}

export function CodeBlock(props: CodeBlockProps) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)

  const copyCode = async () => {
    await navigator.clipboard.writeText(props.code)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className='bg-muted/35 ring-border/70 overflow-hidden rounded-xl ring-1'>
      <div className='border-border/70 flex items-center justify-between border-b px-4 py-2'>
        <span className='text-muted-foreground text-xs font-medium'>
          {props.label}
        </span>
        <Button
          type='button'
          variant='ghost'
          size='sm'
          className='h-7 px-2'
          onClick={copyCode}
          aria-label={t('Copy code')}
        >
          <HugeiconsIcon icon={copied ? Tick02Icon : Copy01Icon} />
          {copied ? t('Copied') : t('Copy')}
        </Button>
      </div>
      <pre className='overflow-x-auto p-4 text-[13px] leading-6'>
        <code>{props.code}</code>
      </pre>
    </div>
  )
}
