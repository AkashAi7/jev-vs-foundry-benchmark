export async function request<T>(
  path: string,
  options: { body?: unknown; token?: string; signal?: AbortSignal } = {},
): Promise<T> {
  const response = await fetch(path, {
    method: options.body === undefined ? 'GET' : 'POST',
    ...(options.signal ? { signal: options.signal } : {}),
    headers: options.body === undefined ? {} : {
      'Content-Type': 'application/json',
      'x-benchmark-token': options.token ?? '',
    },
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
  });
  if (!response.ok) {
    let message = `Request failed (${response.status}). Please try again.`;
    try {
      const error = await response.json() as { error?: string };
      if (typeof error.error === 'string') message = error.error;
    } catch {
      message = `The server returned ${response.status} without an error description.`;
    }
    throw new Error(message);
  }
  return response.json() as Promise<T>;
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'An unexpected request error occurred.';
}
