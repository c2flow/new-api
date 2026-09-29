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
import type {
  OrganizationTutorialRole,
  TutorialStep,
  TutorialTrack,
} from './types'

export const QUICKSTART_TRACK: TutorialTrack = {
  id: 'quickstart',
  titleKey: 'API quick start',
  descriptionKey:
    'Create a key, make your first request, and verify it in logs.',
  steps: [
    {
      id: 'quickstart-create-key',
      titleKey: 'Create API Key',
      descriptionKey: 'Open API Keys and choose Create API Key.',
      href: '/keys',
      target: '[data-tutorial="create-api-key"]',
    },
    {
      id: 'quickstart-key-name',
      titleKey: 'Name',
      descriptionKey:
        'Give the key a recognizable name, then copy and store it securely.',
      href: '/keys',
      target: '[data-tutorial="api-key-name"]',
      advanceOn: 'input',
      inputEvent: 'change',
      minimumInputLength: 1,
    },
    {
      id: 'quickstart-save-key',
      titleKey: 'Save changes',
      descriptionKey: 'Create a personal key for API requests.',
      href: '/keys',
      target: '[data-tutorial="api-key-save"]',
    },
    {
      id: 'quickstart-confirm-key',
      titleKey: 'Create API Key',
      descriptionKey: 'Create a personal key for API requests.',
      href: '/keys',
      target: '[data-tutorial="api-key-confirm"]',
      advanceOn: 'api-key-created',
    },
    {
      id: 'quickstart-copy-key',
      titleKey: 'Copy keys',
      descriptionKey:
        'Copy the newly created API key. You will paste it into the curl request in the next step.',
      href: '/keys',
      target: '[data-tutorial="copy-created-api-key"]',
      advanceOn: 'api-key-copied',
    },
    {
      id: 'quickstart-paste-key',
      titleKey: 'Call the API with curl',
      descriptionKey: 'Paste the API key you just copied.',
      href: '/keys',
      target: '[data-tutorial="curl-key-input"]',
      advanceOn: 'paste-api-key',
      code: 'curl-key',
    },
    {
      id: 'quickstart-copy-curl',
      titleKey: 'Call the API with curl',
      descriptionKey: 'Replace YOUR_API_KEY with the key you just created.',
      href: '/keys',
      target: '[data-tutorial="curl-copy"]',
      advanceOn: 'copy-curl',
      code: 'curl-copy',
    },
    {
      id: 'quickstart-run-curl',
      titleKey: 'Call the API with curl',
      descriptionKey:
        'Run the copied command in your terminal. This guide will continue when the request appears in usage logs.',
      href: '/keys',
      target: '[data-tutorial="api-key-list"]',
      advanceOn: 'request-log',
      code: 'curl-wait',
    },
    {
      id: 'quickstart-logs',
      titleKey: 'Verify the request in usage logs',
      descriptionKey:
        'Confirm the model, token usage, cost, and request status.',
      href: '/usage-logs/common',
      target: '[data-tutorial="usage-logs"]',
    },
  ],
}

export const ORGANIZATION_STEPS: Record<
  OrganizationTutorialRole,
  TutorialStep[]
> = {
  owner: [
    {
      id: 'organization-owner-personal',
      titleKey: 'Switch to the personal workspace',
      descriptionKey:
        'Use the organization switcher and choose Personal before creating an organization.',
      href: '/dashboard/overview',
      target: '[data-tutorial="organization-switcher"]',
    },
    {
      id: 'organization-owner-create',
      titleKey: 'Create organization',
      descriptionKey:
        'Create the shared workspace and set its basic information.',
      href: '/organization/settings',
      target: '[data-tutorial="create-organization"]',
    },
    {
      id: 'organization-owner-invite',
      titleKey: 'Invite an administrator and a member',
      descriptionKey:
        'Add both roles and give each account an initial allowance.',
      href: '/organization/members',
      target: '[data-tutorial="invite-member"]',
    },
    {
      id: 'organization-owner-budget',
      titleKey: 'Reallocate organization quota',
      descriptionKey:
        'Adjust member limits as responsibilities and usage change.',
      href: '/organization/members',
      target: '[data-tutorial="organization-members"]',
    },
    {
      id: 'organization-owner-logs',
      titleKey: 'Review organization usage logs',
      descriptionKey: 'Owners can review usage across the whole organization.',
      href: '/usage-logs/common',
      target: '[data-tutorial="usage-logs"]',
    },
  ],
  admin: [
    {
      id: 'organization-admin-budget',
      titleKey: 'Reallocate member quota',
      descriptionKey:
        'Adjust allowances for members covered by your organization permissions.',
      href: '/organization/members',
      target: '[data-tutorial="organization-members"]',
    },
    {
      id: 'organization-admin-key',
      titleKey: 'Test an organization API key',
      descriptionKey:
        'Create a key in the organization context and make a test call.',
      href: '/keys',
      target: '[data-tutorial="create-api-key"]',
    },
    {
      id: 'organization-admin-logs',
      titleKey: 'Review permitted organization logs',
      descriptionKey:
        'Administrators see organization-wide or delegated usage according to permission.',
      href: '/usage-logs/common',
      target: '[data-tutorial="usage-logs"]',
    },
  ],
  member: [
    {
      id: 'organization-member-access',
      titleKey: 'Sign in and select the organization',
      descriptionKey:
        'Accept the invitation and enter the shared organization context.',
      href: '/dashboard/overview',
      target: '[data-tutorial="organization-switcher"]',
    },
    {
      id: 'organization-member-call',
      titleKey: 'Create a key and call an agent',
      descriptionKey:
        'Use an organization key for API and Playground requests.',
      href: '/playground',
      target: '[data-tutorial="playground-input"]',
    },
    {
      id: 'organization-member-logs',
      titleKey: 'Review your organization usage',
      descriptionKey: 'Members can review only their own requests and costs.',
      href: '/usage-logs/common',
      target: '[data-tutorial="usage-logs"]',
    },
  ],
}

export const ADMIN_TRACK: TutorialTrack = {
  id: 'admin',
  titleKey: 'Platform administration',
  descriptionKey:
    'Configure pricing and channels, then manage users, organizations, and logs.',
  steps: [
    {
      id: 'admin-groups',
      titleKey: 'Add a pricing group',
      descriptionKey: 'Create a group and define who can select it.',
      href: '/system-settings/billing/group-pricing',
      target: '[data-tutorial="group-pricing"]',
    },
    {
      id: 'admin-channels',
      titleKey: 'Add and test a channel',
      descriptionKey: 'Connect an upstream provider and verify model access.',
      href: '/channels',
      target: '[data-tutorial="create-channel"]',
    },
    {
      id: 'admin-pricing',
      titleKey: 'Adjust model pricing',
      descriptionKey:
        'Set model ratios or fixed prices before users send traffic.',
      href: '/system-settings/billing/model-pricing',
      target: '[data-tutorial="model-pricing"]',
    },
    {
      id: 'admin-users',
      titleKey: 'Manage user quota and password',
      descriptionKey: 'Update account balance or reset credentials from Users.',
      href: '/users',
      target: '[data-tutorial="user-management"]',
    },
    {
      id: 'admin-organizations',
      titleKey: 'Manage organization quota and status',
      descriptionKey: 'Adjust organization funds or disable an organization.',
      href: '/platform/organizations',
      target: '[data-tutorial="organization-management"]',
    },
    {
      id: 'admin-logs',
      titleKey: 'Review all platform usage',
      descriptionKey:
        'Platform administrators can inspect requests across users and organizations.',
      href: '/platform/usage-logs/common',
      target: '[data-tutorial="usage-logs"]',
    },
  ],
}
