import type { RefreshOptions } from "../services/refresh";

export function runtimeRefreshOptions(env: NodeJS.ProcessEnv = process.env): RefreshOptions {
  const int = (v: string | undefined) => (v && /^\d+$/.test(v) ? Number(v) : undefined);
  return {
    geminiApiKey: env.GEMINI_API_KEY || undefined,
    geminiModel: env.GEMINI_MODEL || undefined,
    pagesPerRequest: int(env.GEMINI_PAGES_PER_REQUEST),
    maxRequests: int(env.GEMINI_MAX_REQUESTS),
  };
}
