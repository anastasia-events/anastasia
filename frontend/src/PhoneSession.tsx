import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { fetchAccountEmail, PhoneNotAllowedError } from "./api";

const PHONE_STORAGE_KEY = "eventwatcher:phone";

interface PhoneSessionValue {
  phone: string | null;
  email: string | null;
  setPhone: (phone: string) => void;
  setEmail: (email: string) => void;
  logout: () => void;
}

const PhoneSessionContext = createContext<PhoneSessionValue | null>(null);

function readStoredPhone(): string | null {
  try {
    return localStorage.getItem(PHONE_STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStoredPhone(phone: string | null) {
  try {
    if (phone) localStorage.setItem(PHONE_STORAGE_KEY, phone);
    else localStorage.removeItem(PHONE_STORAGE_KEY);
  } catch {
    // localStorage puede fallar (modo privado, etc.) — la sesión simplemente no persiste entre recargas.
  }
}

export function PhoneSessionProvider({ children }: { children: ReactNode }) {
  const [phone, setPhoneState] = useState<string | null>(readStoredPhone);
  const [email, setEmail] = useState<string | null>(null);

  // El email de cuenta vive en el server (uno por usuario) — se trae apenas
  // se conoce el teléfono, así el modal y "Suscrito a" lo tienen prellenado
  // sin tener que pedirlo de nuevo.
  useEffect(() => {
    if (!phone) {
      setEmail(null);
      return;
    }
    let cancelled = false;
    fetchAccountEmail(phone)
      .then((value) => {
        if (!cancelled) setEmail(value);
      })
      .catch((error) => {
        // Sesión guardada de un número que ya no está habilitado: se cierra
        // para que vuelva a identificarse y vea el aviso.
        if (error instanceof PhoneNotAllowedError && !cancelled) {
          writeStoredPhone(null);
          setPhoneState(null);
        }
        // Cualquier otro error: el usuario simplemente tipea el email de nuevo.
      });
    return () => {
      cancelled = true;
    };
  }, [phone]);

  const setPhone = useCallback((value: string) => {
    writeStoredPhone(value);
    setPhoneState(value);
  }, []);

  const logout = useCallback(() => {
    writeStoredPhone(null);
    setPhoneState(null);
    setEmail(null);
  }, []);

  return (
    <PhoneSessionContext.Provider value={{ phone, email, setPhone, setEmail, logout }}>
      {children}
    </PhoneSessionContext.Provider>
  );
}

export function usePhoneSession(): PhoneSessionValue {
  const ctx = useContext(PhoneSessionContext);
  if (!ctx) throw new Error("usePhoneSession debe usarse dentro de PhoneSessionProvider");
  return ctx;
}
