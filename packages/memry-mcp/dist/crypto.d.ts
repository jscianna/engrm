/**
 * Client-side encryption for zero-knowledge storage
 * All encryption happens locally - server only sees encrypted blobs
 */
export interface EncryptedData {
    ciphertext: string;
    iv: string;
    tag: string;
    salt: string;
}
/**
 * Encrypt text locally before sending to server
 */
export declare function encryptLocal(plaintext: string, vaultPassword: string): EncryptedData;
/**
 * Decrypt data received from server
 */
export declare function decryptLocal(encrypted: EncryptedData, vaultPassword: string): string;
/**
 * Check if we have a vault password configured
 */
export declare function hasVaultPassword(): boolean;
/**
 * Get vault password from environment
 */
export declare function getVaultPassword(): string | null;
