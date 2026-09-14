import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'

import { Dialog } from '@/components/dialog'
import { Button } from '@/components/ui/button'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Textarea } from '@/components/ui/textarea'
import { api } from '@/lib/api'

import type { PlatformOrganization } from '../types'

const schema = z.object({
  remark: z
    .string()
    .trim()
    .refine((value) => [...value].length <= 255),
})

export function OrganizationRemarkDialog(props: {
  organization: PlatformOrganization
  close: () => void
}) {
  const { t } = useTranslation()
  const client = useQueryClient()
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { remark: props.organization.remark ?? '' },
    mode: 'onChange',
  })
  const mutation = useMutation({
    mutationFn: async (input: z.infer<typeof schema>) => {
      const response = await api.put<{ success: boolean }>(
        `/api/platform/organizations/${props.organization.id}/remark`,
        input
      )
      if (!response.data.success) throw new Error(t('Request failed'))
    },
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['platform-organizations'] })
      void client.invalidateQueries({
        queryKey: ['platform-organization-resources', props.organization.id],
      })
      props.close()
    },
  })
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !mutation.isPending) props.close()
      }}
      title={t('Edit remark')}
      description={`${props.organization.name} (#${props.organization.id})`}
      contentHeight='auto'
      footer={
        <>
          <Button
            variant='outline'
            disabled={mutation.isPending}
            onClick={props.close}
          >
            {t('Cancel')}
          </Button>
          <Button
            type='submit'
            form='organization-remark-form'
            disabled={!form.formState.isValid || mutation.isPending}
          >
            {mutation.isPending ? t('Processing...') : t('Save')}
          </Button>
        </>
      }
    >
      <form
        id='organization-remark-form'
        onSubmit={form.handleSubmit((input) => {
          if (!mutation.isPending) mutation.mutate(input)
        })}
      >
        <FieldGroup>
          <Field data-invalid={!!form.formState.errors.remark}>
            <FieldLabel htmlFor='organization-remark'>{t('Remark')}</FieldLabel>
            <Textarea
              id='organization-remark'
              disabled={mutation.isPending}
              aria-invalid={!!form.formState.errors.remark}
              aria-describedby='organization-remark-description'
              {...form.register('remark')}
            />
            <p
              id='organization-remark-description'
              className='text-muted-foreground text-sm'
            >
              {t(
                'Only platform administrators can view remarks. Maximum 255 characters.'
              )}
            </p>
            {form.formState.errors.remark && (
              <p role='alert'>{t('Maximum 255 characters.')}</p>
            )}
          </Field>
          {mutation.isError && <p role='alert'>{t('Request failed')}</p>}
        </FieldGroup>
      </form>
    </Dialog>
  )
}
