import { createContext, useContext, useState, useCallback, ReactNode } from "react";

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

interface AdminLockState {
  isLockEnabled: boolean;
  isLocked: boolean;
  enableLock: (password: string) => Promise<void>;
  lock: () => void;
  unlock: (password: string) => Promise<boolean>;
  disableLock: (password: string) => Promise<boolean>;
}

const AdminLockContext = createContext<AdminLockState | null>(null);

export function AdminLockProvider({ children }: { children: ReactNode }) {
  const [isLockEnabled, setIsLockEnabled] = useState(() => !!localStorage.getItem("adminPasswordHash"));
  const [isLocked, setIsLocked] = useState(() => localStorage.getItem("adminLocked") === "true");

  const enableLock = useCallback(async (password: string) => {
    const hash = await sha256(password);
    localStorage.setItem("adminPasswordHash", hash);
    localStorage.setItem("adminLocked", "false");
    setIsLockEnabled(true);
    setIsLocked(false);
  }, []);

  const lock = useCallback(() => {
    localStorage.setItem("adminLocked", "true");
    setIsLocked(true);
  }, []);

  const unlock = useCallback(async (password: string): Promise<boolean> => {
    const hash = await sha256(password);
    if (hash === localStorage.getItem("adminPasswordHash")) {
      localStorage.setItem("adminLocked", "false");
      setIsLocked(false);
      return true;
    }
    return false;
  }, []);

  const disableLock = useCallback(async (password: string): Promise<boolean> => {
    const hash = await sha256(password);
    if (hash === localStorage.getItem("adminPasswordHash")) {
      localStorage.removeItem("adminPasswordHash");
      localStorage.removeItem("adminLocked");
      setIsLockEnabled(false);
      setIsLocked(false);
      return true;
    }
    return false;
  }, []);

  return (
    <AdminLockContext.Provider value={{ isLockEnabled, isLocked, enableLock, lock, unlock, disableLock }}>
      {children}
    </AdminLockContext.Provider>
  );
}

export function useAdminLock(): AdminLockState {
  const ctx = useContext(AdminLockContext);
  if (!ctx) throw new Error("useAdminLock must be used inside AdminLockProvider");
  return ctx;
}
