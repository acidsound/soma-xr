/**
 * Browser-local OpenAI-compatible API configuration.
 *
 * Endpoint, model and key are persisted only in localStorage. They are never
 * included in requests to this app's own server and are never logged.
 */
export interface LocalApiConfig {
  /** OpenAI-compatible base URL, e.g. https://api.openai.com/v1 or http://localhost:11434/v1 */
  endpoint: string;
  /** Model id passed as `model` to POST /chat/completions */
  model: string;
  /** Bearer token, kept only in this browser's localStorage */
  apiKey: string;
}

const STORAGE_KEY = 'soma-xr:openai-compatible-api';

export function normalizeEndpoint(endpoint: string): string {
  return endpoint.trim().replace(/\/+$/, '');
}

export function loadLocalApiConfig(): LocalApiConfig | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<LocalApiConfig>;
    const config: LocalApiConfig = {
      endpoint: normalizeEndpoint(typeof parsed.endpoint === 'string' ? parsed.endpoint : ''),
      model: typeof parsed.model === 'string' ? parsed.model.trim() : '',
      apiKey: typeof parsed.apiKey === 'string' ? parsed.apiKey.trim() : '',
    };
    if (!config.endpoint || !config.model || !config.apiKey) return null;
    return config;
  } catch {
    return null;
  }
}

export function saveLocalApiConfig(config: LocalApiConfig): void {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      endpoint: normalizeEndpoint(config.endpoint),
      model: config.model.trim(),
      apiKey: config.apiKey.trim(),
    }),
  );
}

export function clearLocalApiConfig(): void {
  localStorage.removeItem(STORAGE_KEY);
}

export function hasLocalApiConfig(): boolean {
  return loadLocalApiConfig() !== null;
}
