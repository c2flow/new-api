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
import { useTranslation } from 'react-i18next'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

import { CodeBlock } from './code-block'

type ToolGuidesProps = {
  gatewayUrl: string
  baseUrl: string
}

export function ToolGuides(props: ToolGuidesProps) {
  const { t } = useTranslation()
  const codexSetupCommand = `curl -fsSL ${props.gatewayUrl}/scripts/codex-cli-setup.sh | bash -s -- ${props.gatewayUrl}`
  const claudeSetupCommand = `curl -fsSL ${props.gatewayUrl}/scripts/claude-code-setup.sh | bash -s -- ${props.gatewayUrl}`
  const codexConfig = `model = "gpt-6-astra"
model_provider = "newapi"

[model_providers.newapi]
name = "New API"
base_url = "${props.baseUrl}"
env_key = "NEW_API_KEY"
wire_api = "responses"`
  const claudeShell = `export ANTHROPIC_BASE_URL="${props.gatewayUrl}"
export ANTHROPIC_AUTH_TOKEN="YOUR_API_KEY"
claude`
  const hermesConfig = `model:
  default: Kimi-K2.5
  provider: custom
  base_url: "${props.baseUrl}"
  api_key: "YOUR_API_KEY"
  context_length: 262144`
  const deepSeekHarnessConfig = `llm-pi-ai:
  providers:
    newapi:
      displayName: New API
      apiKeyEnv: NEW_API_KEY
      api: openai-completions
      baseURL: "${props.baseUrl}"
      compat:
        supportsDeveloperRole: false
        maxTokensField: max_tokens
      models:
        - id: Kimi-K2.5
          name: Kimi-K2.5
          contextWindow: 262144
          maxTokens: 32768

agent-default-model:
  provider: newapi
  model: Kimi-K2.5`
  const openCodeConfig = `{
  "$schema": "https://opencode.ai/config.json",
  "model": "newapi/YOUR_MODEL",
  "providers": {
    "newapi": {
      "name": "New API",
      "env": ["NEW_API_KEY"],
      "package": "@opencode/ai/providers/openai-compatible",
      "settings": {
        "baseURL": "${props.baseUrl}",
        "apiKey": "{env:NEW_API_KEY}"
      },
      "models": {
        "YOUR_MODEL": { "name": "YOUR_MODEL" }
      }
    }
  }
}`

  return (
    <Tabs defaultValue='cc-switch' className='mt-6 gap-5'>
      <TabsList className='grid w-full grid-cols-2 gap-1 py-1.5 group-data-horizontal/tabs:h-auto sm:grid-cols-3 lg:grid-cols-6'>
        <TabsTrigger
          value='cc-switch'
          className='h-9 w-fit min-w-24 justify-self-center px-4'
        >
          {t('CC Switch')}
        </TabsTrigger>
        <TabsTrigger
          value='codex'
          className='h-9 w-fit min-w-24 justify-self-center px-4'
        >
          {t('Codex')}
        </TabsTrigger>
        <TabsTrigger
          value='claude-code'
          className='h-9 w-fit min-w-24 justify-self-center px-4'
        >
          {t('Claude Code')}
        </TabsTrigger>
        <TabsTrigger
          value='opencode'
          className='h-9 w-fit min-w-24 justify-self-center px-4'
        >
          {t('OpenCode')}
        </TabsTrigger>
        <TabsTrigger
          value='hermes'
          className='h-9 w-fit min-w-24 justify-self-center px-4'
        >
          {t('Hermes')}
        </TabsTrigger>
        <TabsTrigger
          value='deepseek-harness'
          className='h-9 w-fit min-w-24 justify-self-center px-4'
        >
          {t('DeepSeek Harness')}
        </TabsTrigger>
      </TabsList>

      <TabsContent value='cc-switch'>
        <ol className='space-y-5'>
          <GuideStep
            number='1'
            title={t('Add a custom provider')}
            description={t('In CC Switch, add a provider and select Custom.')}
          />
          <GuideStep
            number='2'
            title={t('Choose the target application')}
            description={t('Select Claude or Codex, then enter your API key.')}
          />
          <GuideStep
            number='3'
            title={t('Set the endpoint and model')}
            description={t(
              'Use the matching endpoint below, select an enabled model, save, and activate the provider.'
            )}
          />
        </ol>
        <dl className='border-border mt-5 divide-y rounded-xl border'>
          <EndpointRow label={t('Claude endpoint')} value={props.gatewayUrl} />
          <EndpointRow label={t('Codex endpoint')} value={props.baseUrl} />
        </dl>
        <p className='text-muted-foreground mt-4 text-sm leading-6'>
          {t(
            'Restart the target CLI after switching providers if the change is not detected.'
          )}
        </p>
      </TabsContent>

      <TabsContent value='codex'>
        <InteractiveSetup command={codexSetupCommand} />
        <MethodDivider />
        <p className='text-muted-foreground mb-4 text-sm leading-6'>
          {t('Save this configuration to ~/.codex/config.toml.')}
        </p>
        <CodeBlock code={codexConfig} label='~/.codex/config.toml' />
        <p className='text-muted-foreground mt-5 mb-4 text-sm leading-6'>
          {t('Set the key in your shell, then start Codex.')}
        </p>
        <CodeBlock
          code={'export NEW_API_KEY="YOUR_API_KEY"\ncodex'}
          label={t('Shell')}
        />
        <p className='text-muted-foreground mt-4 text-sm leading-6'>
          {t(
            'The default model is gpt-6-astra. Use /model in Codex to switch models.'
          )}
        </p>
      </TabsContent>

      <TabsContent value='claude-code'>
        <InteractiveSetup command={claudeSetupCommand} />
        <MethodDivider />
        <p className='text-muted-foreground mb-4 text-sm leading-6'>
          {t('Set these variables in your shell, then start Claude Code.')}
        </p>
        <CodeBlock code={claudeShell} label={t('Shell')} />
        <p className='text-muted-foreground mt-4 text-sm leading-6'>
          {t(
            'Claude Code uses the service root URL and adds /v1/messages automatically.'
          )}{' '}
          {t(
            'Run /status in Claude Code to verify the base URL and credential source.'
          )}
        </p>
      </TabsContent>

      <TabsContent value='opencode'>
        <p className='text-muted-foreground mb-4 text-sm leading-6'>
          {t('Save this configuration as opencode.jsonc.')}
        </p>
        <CodeBlock code={openCodeConfig} label='opencode.jsonc' />
        <p className='text-muted-foreground mt-5 mb-4 text-sm leading-6'>
          {t(
            'Set the key in your shell, start OpenCode, then select the model with /models.'
          )}
        </p>
        <CodeBlock
          code={'export NEW_API_KEY="YOUR_API_KEY"\nopencode'}
          label={t('Shell')}
        />
      </TabsContent>

      <TabsContent value='hermes'>
        <p className='text-muted-foreground mb-4 text-sm leading-6'>
          {t('Save this configuration to ~/.hermes/config.yaml.')}
        </p>
        <CodeBlock code={hermesConfig} label='~/.hermes/config.yaml' />
        <p className='text-muted-foreground mt-5 mb-4 text-sm leading-6'>
          {t('Start Hermes Agent after saving the configuration.')}
        </p>
        <CodeBlock code='hermes chat' label={t('Shell')} />
      </TabsContent>

      <TabsContent value='deepseek-harness'>
        <ol className='space-y-5'>
          <GuideStep
            number='1'
            title={t('Start the DeepSeek Harness Web UI')}
            description={t(
              'Run the command below, then open the local Web UI.'
            )}
          />
          <GuideStep
            number='2'
            title={t('Add a custom provider')}
            description={t(
              'Open Settings → Models, set the provider ID to newapi, select openai-completions, and enter the API URL and key.'
            )}
          />
          <GuideStep
            number='3'
            title={t('Add and select Kimi-K2.5')}
            description={t(
              'Add Kimi-K2.5 to the provider, save it, and select it for the new session.'
            )}
          />
        </ol>
        <div className='mt-5'>
          <CodeBlock code='npx @deepseek-ai/dsh web' label={t('Shell')} />
        </div>
        <MethodDivider />
        <p className='text-muted-foreground mb-4 text-sm leading-6'>
          {t(
            'For manual configuration, set NEW_API_KEY in your shell and save this section to $DSH_HOME/settings.yaml.'
          )}
        </p>
        <CodeBlock
          code='export NEW_API_KEY="YOUR_API_KEY"'
          label={t('Shell')}
        />
        <div className='mt-4'>
          <CodeBlock
            code={deepSeekHarnessConfig}
            label='$DSH_HOME/settings.yaml'
          />
        </div>
      </TabsContent>
    </Tabs>
  )
}

function InteractiveSetup(props: { command: string }) {
  const { t } = useTranslation()

  return (
    <div>
      <h3 className='font-medium'>{t('Interactive setup (macOS/Linux)')}</h3>
      <p className='text-muted-foreground mt-2 mb-4 text-sm leading-6'>
        {t(
          'Run this command. The script uses the current site address automatically and asks only for the required settings.'
        )}
      </p>
      <CodeBlock code={props.command} label={t('Shell')} />
    </div>
  )
}

function MethodDivider() {
  const { t } = useTranslation()

  return (
    <div className='my-6 flex items-center gap-3' role='separator'>
      <span className='bg-border h-px flex-1' />
      <span className='text-muted-foreground text-xs font-medium'>
        {t('Manual configuration')}
      </span>
      <span className='bg-border h-px flex-1' />
    </div>
  )
}

function GuideStep(props: {
  number: string
  title: string
  description: string
}) {
  return (
    <li className='flex gap-3'>
      <span className='bg-primary/10 text-primary flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold'>
        {props.number}
      </span>
      <div>
        <h3 className='font-medium'>{props.title}</h3>
        <p className='text-muted-foreground mt-1 text-sm leading-6'>
          {props.description}
        </p>
      </div>
    </li>
  )
}

function EndpointRow(props: { label: string; value: string }) {
  return (
    <div className='grid gap-1 px-4 py-3 sm:grid-cols-[150px_1fr] sm:gap-4'>
      <dt className='text-muted-foreground text-sm'>{props.label}</dt>
      <dd className='font-mono text-sm break-all'>{props.value}</dd>
    </div>
  )
}
