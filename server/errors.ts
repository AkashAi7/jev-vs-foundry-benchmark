export class LabError extends Error {
  constructor(message: string, public readonly status = 400) {
    super(message);
    this.name = 'LabError';
  }
}

export function safeError(error: unknown): string {
  if (error instanceof LabError) return error.message;
  // OpenAI wraps bearer-token failures in an Error.cause chain.
  for (let current = error, depth = 0; current instanceof Error && depth < 8; current = current.cause, depth++) {
    if (/\bAADSTS53003\b/.test(current.message)) {
      return 'Foundry token issuance for the selected Microsoft Entra identity was blocked by Conditional Access (AADSTS53003). Ask your tenant administrator to review the Conditional Access tab in Service principal sign-ins or User sign-ins, matching the configured authentication mode. No Foundry model inference was measured; no alternative identity or API-key fallback was attempted.';
    }
    if (['CredentialUnavailableError', 'AuthenticationRequiredError'].includes(current.name)) {
      return 'The selected Microsoft Entra credential is unavailable or needs sign-in. For vscode mode, sign in through the Azure Resources extension on this machine for the configured AZURE_TENANT_ID, then retry explicitly. For service-principal mode, check the three AZURE identity variables. No alternative identity or API-key fallback was attempted.';
    }
  }
  if (error instanceof Error && ['AbortError', 'TimeoutError', 'APITimeoutError', 'APIConnectionTimeoutError'].includes(error.name)) {
    return 'Request timed out or was cancelled. No automatic retry was made.';
  }
  if (typeof error === 'object' && error !== null && 'status' in error && typeof error.status === 'number') {
    const descriptions: Record<number, string> = {
      400: 'Provider rejected the request. Verify model support for strict structured output.',
      401: 'Provider authentication failed. Check the Jev key or the selected Foundry Microsoft Entra identity, token audience and inference permissions.',
      403: 'Provider access denied. Check model access and Azure inference permissions.',
      404: 'Provider deployment or model was not found. Check the endpoint and deployment name.',
      429: 'Provider rate limit or quota reached. No automatic retry was made.',
    };
    return descriptions[error.status] ?? `Provider returned HTTP ${error.status}. No automatic retry was made.`;
  }
  return 'Provider or credential operation failed. Check connectivity and server authentication. Raw error details are withheld to protect credentials.';
}
