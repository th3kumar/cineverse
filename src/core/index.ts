import { loadConfig, type CineConfig } from "./config";
import { buildProviders, type RegistryDeps } from "./registry";
import { CineverseService } from "./service";

export * from "./types";
export type * from "./ports";
export { CineverseService } from "./service";
export { loadConfig } from "./config";
export { ConfigError } from "./registry";

export function createCineverse(cfg: CineConfig = loadConfig(), deps?: RegistryDeps) {
  return new CineverseService(buildProviders(cfg, deps), {
    region: cfg.CINE_REGION,
    defaultCount: cfg.CINE_RECOMMENDATION_COUNT,
  });
}

// One instance per server process (keeps the in-memory cache warm across requests).
const g = globalThis as unknown as { __cineverse?: CineverseService };
export function getCineverse(): CineverseService {
  return (g.__cineverse ??= createCineverse());
}
