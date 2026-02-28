"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { base64ToBytes, bytesToBase64, deriveKeyFromPassword, encryptClientSide, exportKeyToBase64, generateSalt, importKeyFromBase64 } from "@/lib/client-crypto";
import { generateArweaveWallet, getWalletAddress } from "@/lib/arweave-wallet";
import { VaultPasswordModal } from "@/components/vault-password-modal";
import { OnboardingWizard } from "@/components/onboarding-wizard";

type VaultContextValue = {
  key: CryptoKey | null;
  unlocked: boolean;
  hasVault: boolean;
  exportRecoveryKey: () => Promise<string>;
  importRecoveryKey: (base64: string) => Promise<void>;
  lockVault: () => void;
};

const VaultContext = createContext<VaultContextValue | null>(null);

type VaultProviderProps = {
  children: React.ReactNode;
  initialHasVault: boolean;
  userId: string;
};

export function VaultProvider({ children, initialHasVault, userId }: VaultProviderProps) {
  const [key, setKey] = useState<CryptoKey | null>(null);
  const [hasVault, setHasVault] = useState(initialHasVault);
  const [saltB64, setSaltB64] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [initializing, setInitializing] = useState(true); // Prevent modal flash

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const response = await fetch("/api/settings/vault", { cache: "no-store" });
        const payload = (await response.json()) as { hasVault?: boolean; salt?: string | null; error?: string };
        if (!response.ok) {
          throw new Error(payload.error || "Failed to load vault status");
        }
        if (!active) return;
        setHasVault(Boolean(payload.hasVault));
        setSaltB64(payload.salt ?? null);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to load vault status";
        toast.error(message);
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const sessionKey = `memry_vault_key_b64:${userId}`;
        const stored = sessionStorage.getItem(sessionKey);
        if (!stored) {
          if (active) setInitializing(false);
          return;
        }
        const imported = await importKeyFromBase64(stored);
        if (active) {
          setKey(imported);
          setInitializing(false);
        }
      } catch {
        sessionStorage.removeItem(`memry_vault_key_b64:${userId}`);
        if (active) setInitializing(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [userId]);

  async function setup(password: string) {
    setLoading(true);
    try {
      const salt = generateSalt();
      const derivedKey = await deriveKeyFromPassword(password, salt);
      const saltEncoded = bytesToBase64(salt);

      // Generate Arweave wallet and encrypt with vault key
      const arweaveWallet = await generateArweaveWallet();
      const walletJson = JSON.stringify(arweaveWallet);
      const { ciphertext: walletEncrypted, iv: walletIv } = await encryptClientSide(walletJson, derivedKey);
      const walletAddress = await getWalletAddress(arweaveWallet);

      const response = await fetch("/api/settings/vault", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          salt: saltEncoded,
          arweaveWalletEncrypted: walletEncrypted,
          arweaveWalletIv: walletIv,
          arweaveWalletAddress: walletAddress,
        }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error || "Failed to configure vault");
      }

      const keyB64 = await exportKeyToBase64(derivedKey);
      sessionStorage.setItem(`memry_vault_key_b64:${userId}`, keyB64);
      setSaltB64(saltEncoded);
      setHasVault(true);
      setKey(derivedKey);
      toast.success("Vault created with Arweave wallet.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to configure vault";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  async function unlock(password: string) {
    if (!saltB64) {
      toast.error("Vault salt is missing. Refresh and try again.");
      return;
    }

    setLoading(true);
    try {
      const derivedKey = await deriveKeyFromPassword(password, base64ToBytes(saltB64));
      const keyB64 = await exportKeyToBase64(derivedKey);
      sessionStorage.setItem(`memry_vault_key_b64:${userId}`, keyB64);
      setKey(derivedKey);
      toast.success("Vault unlocked.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to unlock vault";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  const exportRecoveryKey = useCallback(async (): Promise<string> => {
    if (!key) {
      throw new Error("Unlock your vault first.");
    }
    return exportKeyToBase64(key);
  }, [key]);

  const importRecoveryKey = useCallback(async (base64: string): Promise<void> => {
    const imported = await importKeyFromBase64(base64);
    const keyB64 = await exportKeyToBase64(imported);
    sessionStorage.setItem(`memry_vault_key_b64:${userId}`, keyB64);
    setKey(imported);
  }, [userId]);

  const lockVault = useCallback(() => {
    sessionStorage.removeItem(`memry_vault_key_b64:${userId}`);
    setKey(null);
  }, [userId]);

  const value = useMemo<VaultContextValue>(
    () => ({
      key,
      unlocked: Boolean(key),
      hasVault,
      exportRecoveryKey,
      importRecoveryKey,
      lockVault,
    }),
    [exportRecoveryKey, hasVault, importRecoveryKey, key, lockVault],
  );

  const handleOnboardingComplete = useCallback((derivedKey: CryptoKey) => {
    setKey(derivedKey);
    setHasVault(true);
  }, []);

  return (
    <VaultContext.Provider value={value}>
      {children}
      {!initializing && !key ? (
        hasVault ? (
          <VaultPasswordModal mode="unlock" loading={loading} onSubmit={unlock} />
        ) : (
          <OnboardingWizard userId={userId} onComplete={handleOnboardingComplete} />
        )
      ) : null}
    </VaultContext.Provider>
  );
}

export function useVault() {
  const context = useContext(VaultContext);
  if (!context) {
    throw new Error("useVault must be used inside VaultProvider");
  }
  return context;
}
