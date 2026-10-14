import { safeStorage } from 'electron';
import type { SecretBox } from '@ultimatellm/accounts';

/**
 * Encrypts provider keys with the OS credential store: Keychain on macOS,
 * DPAPI on Windows, libsecret/KWallet on Linux. Call after the app is ready.
 */
export function createSafeStorageBox(): SecretBox {
  if (process.platform === 'linux' && safeStorage.getSelectedStorageBackend() === 'basic_text') {
    // No keyring (e.g. a minimal desktop or CI). Chromium then only obfuscates
    // secrets, like Chrome does in the same situation.
    console.warn('No OS keyring found: saved API keys are only weakly protected on this system.');
    safeStorage.setUsePlainTextEncryption(true);
  }

  return {
    encrypt(plaintext) {
      if (!safeStorage.isEncryptionAvailable()) {
        throw new Error("Your system's secure storage isn't available, so the key can't be saved.");
      }
      return safeStorage.encryptString(plaintext).toString('base64');
    },
    decrypt(ciphertext) {
      return safeStorage.decryptString(Buffer.from(ciphertext, 'base64'));
    },
  };
}
