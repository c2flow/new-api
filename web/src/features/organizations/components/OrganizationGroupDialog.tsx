import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Controller, useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'

import { Dialog } from '@/components/dialog'
import { Button } from '@/components/ui/button'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { api } from '@/lib/api'

import type { PlatformOrganization } from '../types'

const schema = z.object({ group: z.string().trim().min(1) })

export function OrganizationGroupDialog(props: {
  organization: PlatformOrganization
  close: () => void
}) {
  const { t } = useTranslation()
  const client = useQueryClient()
  const groups = useQuery({
    queryKey: ['platform-groups'],
    queryFn: async () => {
      const response = await api.get<{ success: boolean; data: string[] }>(
        '/api/group/'
      )
      if (!response.data.success) throw new Error(t('Request failed'))
      return response.data.data
        .filter((group) => group !== 'auto')
        .sort((left, right) => left.localeCompare(right))
    },
  })
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { group: props.organization.group },
    mode: 'onChange',
  })
  const mutation = useMutation({
    mutationFn: async (input: z.infer<typeof schema>) => {
      const response = await api.put<{ success: boolean }>(
        `/api/platform/organizations/${props.organization.id}/group`,
        input
      )
      if (!response.data.success) throw new Error(t('Request failed'))
    },
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['platform-organizations'] })
      void client.invalidateQueries({ queryKey: ['organizations'] })
      void client.invalidateQueries({ queryKey: ['organization-context'] })
      void client.invalidateQueries({ queryKey: ['user-groups'] })
      void client.invalidateQueries({ queryKey: ['user-models'] })
      void client.invalidateQueries({ queryKey: ['pricing'] })
      props.close()
    },
  })

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !mutation.isPending) props.close()
      }}
      title={t('Edit group')}
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
            form='organization-group-form'
            disabled={groups.isLoading || groups.isError || mutation.isPending}
          >
            {mutation.isPending ? t('Processing...') : t('Save')}
          </Button>
        </>
      }
    >
      <form
        id='organization-group-form'
        onSubmit={form.handleSubmit((input) => {
          if (!mutation.isPending) mutation.mutate(input)
        })}
      >
        <FieldGroup>
          <Controller
            control={form.control}
            name='group'
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor='organization-group'>
                  {t('Group')}
                </FieldLabel>
                <NativeSelect
                  id='organization-group'
                  disabled={
                    groups.isLoading || groups.isError || mutation.isPending
                  }
                  aria-invalid={fieldState.invalid}
                  {...field}
                >
                  {groups.data?.map((group) => (
                    <NativeSelectOption key={group} value={group}>
                      {group}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </Field>
            )}
          />
          {(groups.isError || mutation.isError) && (
            <p role='alert'>{t('Request failed')}</p>
          )}
        </FieldGroup>
      </form>
    </Dialog>
  )
}
