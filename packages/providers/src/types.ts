import type { Effort, ProviderId } from '@ultimatellm/shared';
import type { SharedV4ProviderOptions as ProviderOptions } from '@ai-sdk/provider';
import type { LanguageModel } from 'ai';

export interface ApiKeyCredential {
  type: 'api_key';
  apiKey: string;
}

/** How a request authenticates. ChatGPT-plan sign-in is added in a later milestone. */
export type Credential = ApiKeyCredential;

export interface ValidationResult {
  /** Model IDs the credential can use, as reported by the provider. */
  models: string[];
}

export interface ProviderAdapter {
  readonly id: ProviderId;
  /**
   * Checks a credential with a free request (listing models) and returns what it can use.
   * Throws a `ProviderError` if the provider rejects it.
   */
  validate(credential: Credential, signal?: AbortSignal): Promise<ValidationResult>;
  /** An AI SDK language model for `modelId`, authenticated with `credential`. */
  languageModel(modelId: string, credential: Credential): LanguageModel;
  /**
   * Provider-specific request options for an effort level. The caller passes a
   * level the model supports (see `ModelRegistry.supportedEffort`).
   */
  effortOptions(modelId: string, effort: Effort): ProviderOptions | undefined;
}
