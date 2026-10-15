import bundledJson from '../data/registry.v1.json';
import type { ModelRegistry } from './registry';
import { parseRegistry } from './update';

/** The registry shipped with this app version. A downloaded one replaces it if newer. */
export const BUNDLED_REGISTRY: ModelRegistry = parseRegistry(bundledJson).registry;

/** The bundled registry file's raw JSON (for tests). */
export const BUNDLED_REGISTRY_FILE: unknown = bundledJson;
