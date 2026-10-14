import type { UllApi } from '@ultimatellm/shared';

declare global {
  interface Window {
    /** Exposed by the preload script (src/preload/index.ts). */
    readonly ull: UllApi;
  }
}
