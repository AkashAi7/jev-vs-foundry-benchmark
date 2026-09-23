import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { FOUNDRY_AUTH_MODES, type ConfigUpdate, type FoundryAuth, type PublicConfig, type RunOptions } from '../shared/types';
import { LabError } from './errors';

export interface ProviderConfig {
  jevKey: string;
  jevModel: string;
  foundryEndpoint: string;
  foundryDeployment: string;
  foundryAuth: FoundryAuth;
  foundryTenantId: string;
  servicePrincipal: { tenantId: string; clientId: string; clientSecret: string } | null;
}

const modelName = z.string().trim().min(1).max(128).regex(/^[\w.-]+$/);
export const configSchema = z.object({
  jevKey: z.string().trim().min(1).max(2048).optional(),
  foundryEndpoint: z.string().trim().max(300).optional(),
  foundryDeployment: modelName.or(z.literal('')).optional(),
  jevModel: modelName.optional(),
  clearKeys: z.boolean().optional(),
}).strict();

export function normalizeEndpoint(value: string): string {
  if (!value) return '';
  let url: URL;
  try { url = new URL(value); } catch { throw new LabError('Use a valid HTTPS Foundry account inference endpoint.'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.search || url.hash
      || !/^[a-z0-9-]+\.(openai\.azure\.com|services\.ai\.azure\.com)$/i.test(url.hostname)
      || !['/', '/openai/v1', '/openai/v1/'].includes(url.pathname)) {
    throw new LabError('Use the Azure public-cloud account endpoint (https://NAME.openai.azure.com or https://NAME.services.ai.azure.com), not a project URL. Custom hosts are not accepted.');
  }
  return `${url.origin}/openai/v1/`;
}

export class Configuration {
  private value: ProviderConfig;
  readonly csrfToken = randomBytes(32).toString('hex');

  constructor(env: NodeJS.ProcessEnv = process.env) {
    const tenantId = env.AZURE_TENANT_ID?.trim() ?? '';
    const clientId = env.AZURE_CLIENT_ID?.trim() ?? '';
    const clientSecret = env.AZURE_CLIENT_SECRET?.trim() ?? '';
    const auth = z.enum(FOUNDRY_AUTH_MODES).safeParse(env.FOUNDRY_AUTH_MODE?.trim() ?? 'service-principal');
    if (!auth.success) throw new LabError('FOUNDRY_AUTH_MODE must be service-principal, vscode or azure-cli. No authentication fallback is used.');
    this.value = {
      jevKey: env.TYPESAFE_API_KEY?.trim() ?? '',
      jevModel: modelName.parse(env.JEV_MODEL ?? 'jev-latest'),
      foundryEndpoint: normalizeEndpoint(env.FOUNDRY_ENDPOINT?.trim() ?? ''),
      foundryDeployment: modelName.or(z.literal('')).parse(env.FOUNDRY_DEPLOYMENT ?? ''),
      foundryAuth: auth.data,
      foundryTenantId: tenantId,
      servicePrincipal: auth.data === 'service-principal' && tenantId && clientId && clientSecret ? { tenantId, clientId, clientSecret } : null,
    };
  }

  snapshot(): ProviderConfig { return structuredClone(this.value); }

  public(): PublicConfig {
    const identityConfigured = foundryIdentityConfigured(this.value);
    return {
      csrfToken: this.csrfToken,
      jevConfigured: Boolean(this.value.jevKey),
      foundryConfigured: Boolean(this.value.foundryEndpoint && this.value.foundryDeployment && identityConfigured),
      foundryEndpoint: this.value.foundryEndpoint,
      foundryDeployment: this.value.foundryDeployment,
      jevModel: this.value.jevModel,
      foundryAuth: this.value.foundryAuth,
      foundryIdentityConfigured: identityConfigured,
    };
  }

  update(input: ConfigUpdate): PublicConfig {
    const patch = configSchema.parse(input);
    const next = { ...this.value };
    if (patch.clearKeys) next.jevKey = '';
    if (patch.jevKey) next.jevKey = patch.jevKey;
    if (patch.jevModel) next.jevModel = patch.jevModel;
    if (patch.foundryEndpoint !== undefined) next.foundryEndpoint = normalizeEndpoint(patch.foundryEndpoint);
    if (patch.foundryDeployment !== undefined) next.foundryDeployment = patch.foundryDeployment;
    this.value = next;
    return this.public();
  }
}

export function foundryIdentityConfigured(config: ProviderConfig): boolean {
  if (config.foundryAuth === 'vscode') return Boolean(config.foundryTenantId);
  if (config.foundryAuth === 'azure-cli') return true;
  return config.servicePrincipal !== null;
}

export function requireConfigured(options: RunOptions, config: ProviderConfig): void {
  if (options.mode === 'demo') return;
  if (options.arms.some(arm => arm !== 'foundry') && !config.jevKey) {
    throw new LabError('Jev is not configured. Add a server-side Jev key in Connections, or choose sample mode.');
  }
  if (options.arms.some(arm => arm !== 'jev') && (!config.foundryEndpoint || !config.foundryDeployment)) {
    throw new LabError('Select a project and deployment in Foundry Toolkit, then enter its account endpoint and deployment in Connections. A Jev-only live run is also available.');
  }
  if (options.arms.some(arm => arm !== 'jev') && !foundryIdentityConfigured(config)) {
    if (config.foundryAuth === 'vscode') {
      throw new LabError('VS Code authentication requires AZURE_TENANT_ID for the Foundry resource tenant. Set it in the server environment and restart, then sign in through the Azure Resources extension. No service-principal or API-key fallback is used.');
    }
    if (config.foundryAuth === 'azure-cli') {
      throw new LabError('Azure CLI authentication requires a signed-in az session (run az login) on the server host. No service-principal or API-key fallback is used.');
    }
    throw new LabError('Foundry requires a service principal: set AZURE_TENANT_ID, AZURE_CLIENT_ID and AZURE_CLIENT_SECRET in the server environment and restart. No personal-login or API-key fallback is used.');
  }
}
