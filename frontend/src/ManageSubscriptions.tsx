import { ArrowLeft, Check, LogOut, Mail, Send, MessageCircle, X, type LucideIcon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import {
  cancelSubscription,
  createEmailSubscription,
  createTelegramSubscription,
  createWhatsappSubscription,
  fetchSubscriptions,
  startSession,
  type Channel,
  type SubscribedEvent,
} from "./api";
import { usePhoneSession } from "./PhoneSession";
import { useEnabledChannels } from "./useEnabledChannels";

const CHANNELS: { channel: Channel; label: string; icon: LucideIcon }[] = [
  { channel: "WHATSAPP", label: "WhatsApp", icon: MessageCircle },
  { channel: "TELEGRAM", label: "Telegram", icon: Send },
  { channel: "EMAIL", label: "Email", icon: Mail },
];

interface ManageSubscriptionsProps {
  onBack: () => void;
}

function ManageSubscriptions({ onBack }: ManageSubscriptionsProps) {
  const {
    phone: sessionPhone,
    email: sessionEmail,
    setPhone: setSessionPhone,
    setEmail: setSessionEmail,
    logout,
  } = usePhoneSession();
  const [phoneInput, setPhoneInput] = useState("");
  const enabledChannels = useEnabledChannels();
  const [identified, setIdentified] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<SubscribedEvent[]>([]);
  const [emailPromptFor, setEmailPromptFor] = useState<string | null>(null);
  const [emailInput, setEmailInput] = useState("");
  const [busyCell, setBusyCell] = useState<string | null>(null);
  const [telegramDeepLink, setTelegramDeepLink] = useState<string | null>(null);

  const refresh = useCallback((phone: string) => {
    setLoading(true);
    setError(null);
    setTelegramDeepLink(null);
    fetchSubscriptions(phone)
      .then((data) => {
        setRows(data);
        setIdentified(true);
      })
      .catch(() => setError("No se pudieron cargar tus suscripciones. Intentá de nuevo."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!sessionPhone) return;
    refresh(sessionPhone);
  }, [sessionPhone, refresh]);

  // Confirmar Telegram pasa por el bot en otra pestaña — cuando volvés a
  // esta, refresca solo para que el check se prenda sin tener que recargar
  // a mano.
  useEffect(() => {
    if (!sessionPhone) return;
    function handleFocus() {
      if (sessionPhone) refresh(sessionPhone);
    }
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [sessionPhone, refresh]);

  async function handleIdentify() {
    if (!phoneInput.trim()) return;
    setLoading(true);
    setError(null);
    try {
      setSessionPhone(await startSession(phoneInput.trim()));
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo validar el número.");
    } finally {
      setLoading(false);
    }
  }

  function handleLogout() {
    logout();
    setIdentified(false);
    setRows([]);
    setPhoneInput("");
  }

  function cellKey(eventId: string, channel: Channel) {
    return `${eventId}:${channel}`;
  }

  async function turnOff(row: SubscribedEvent, channel: Channel) {
    const subscriptionId = row.channels[channel];
    if (!subscriptionId || !sessionPhone) return;

    setBusyCell(cellKey(row.id, channel));
    try {
      await cancelSubscription(subscriptionId, sessionPhone);
      setRows((prev) =>
        prev
          .map((r) =>
            r.id === row.id
              ? { ...r, channels: { ...r.channels, [channel]: undefined } }
              : r
          )
          .filter((r) => Object.values(r.channels).some(Boolean))
      );
    } catch {
      setError("No se pudo cancelar. Intentá de nuevo.");
    } finally {
      setBusyCell(null);
    }
  }

  async function turnOn(row: SubscribedEvent, channel: Channel, emailOverride?: string) {
    if (!sessionPhone) return;

    setBusyCell(cellKey(row.id, channel));
    setError(null);
    try {
      if (channel === "TELEGRAM") {
        const result = await createTelegramSubscription(row.id, sessionPhone);
        if (result.linked) {
          // Ya había iniciado el bot antes — alta instantánea, como WhatsApp/Email.
          setRows((prev) =>
            prev.map((r) =>
              r.id === row.id
                ? { ...r, channels: { ...r.channels, TELEGRAM: result.subscriptionId } }
                : r
            )
          );
        } else {
          // Primera vez: mostramos el link para que lo abra cuando quiera,
          // en vez de redirigirlo solo. El refresh-on-focus se encarga de
          // prender el check apenas vuelva de confirmar en el bot.
          setTelegramDeepLink(result.deepLink);
        }
        return;
      }

      let subscriptionId: string;
      if (channel === "EMAIL") {
        const result = await createEmailSubscription(row.id, sessionPhone, emailOverride ?? "");
        subscriptionId = result.subscriptionId;
        setSessionEmail(result.email);
      } else {
        subscriptionId = (await createWhatsappSubscription(row.id, sessionPhone)).subscriptionId;
      }

      setRows((prev) =>
        prev.map((r) =>
          r.id === row.id ? { ...r, channels: { ...r.channels, [channel]: subscriptionId } } : r
        )
      );
    } catch {
      setError("No se pudo activar. Intentá de nuevo.");
    } finally {
      setBusyCell(null);
      setEmailPromptFor(null);
      setEmailInput("");
    }
  }

  function handleCellClick(row: SubscribedEvent, channel: Channel) {
    if (row.channels[channel]) {
      turnOff(row, channel);
      return;
    }
    if (channel === "EMAIL") {
      setEmailPromptFor(row.id);
      setEmailInput(sessionEmail ?? "");
      return;
    }
    turnOn(row, channel);
  }

  // Canal deshabilitado en el server: no se ofrece, salvo que el usuario ya
  // tenga una suscripción ahí (para que al menos pueda cancelarla).
  const visibleChannels = CHANNELS.filter(
    ({ channel }) => enabledChannels.has(channel) || rows.some((row) => row.channels[channel])
  );

  return (
    <main className="mx-auto max-w-2xl px-4 py-6 sm:py-10">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-sm text-body transition hover:text-heading"
        >
          <ArrowLeft size={15} />
          Volver
        </button>

        {sessionPhone && (
          <button
            type="button"
            onClick={handleLogout}
            className="inline-flex items-center gap-1.5 text-sm text-body transition hover:text-heading"
          >
            <LogOut size={15} />
            Cerrar sesión
          </button>
        )}
      </div>

      <h1 className="mt-4 text-4xl font-bold tracking-tight text-heading">Suscrito a</h1>

      {!sessionPhone && (
        <div className="mt-6 max-w-xs">
          <p className="text-xs font-medium uppercase tracking-widest text-body/70">
            Identificate con tu celu
          </p>
          <input
            type="tel"
            className="mt-3 w-full rounded-xl border border-line bg-white px-4 py-2.5 text-heading outline-none focus:border-ink/40"
            placeholder="Ej: 3001234567"
            value={phoneInput}
            onChange={(e) => setPhoneInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleIdentify()}
            autoFocus
          />
          <button
            type="button"
            onClick={handleIdentify}
            disabled={loading || !phoneInput.trim()}
            className="mt-4 rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-paper transition hover:bg-ink-soft disabled:opacity-40"
          >
            {loading ? "Buscando..." : "Ver mis suscripciones"}
          </button>
        </div>
      )}

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

      {telegramDeepLink && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-white p-4">
          <p className="text-sm text-body">
            Para confirmar por Telegram, abrí el bot y tocá <strong>Start</strong>.
          </p>
          <a
            href={telegramDeepLink}
            target="_blank"
            rel="noreferrer"
            onClick={() => setTelegramDeepLink(null)}
            className="inline-flex shrink-0 items-center gap-2 rounded-full bg-ink px-4 py-2 text-sm font-medium text-paper transition hover:bg-ink-soft"
          >
            <Send size={15} />
            Abrir Telegram
          </a>
        </div>
      )}

      {identified && rows.length === 0 && !loading && (
        <p className="mt-6 text-sm">No tenés suscripciones activas todavía.</p>
      )}

      {identified && rows.length > 0 && (
        <div className="mt-8 overflow-x-auto">
          <table className="w-full border-separate border-spacing-y-2">
            <thead>
              <tr>
                <th className="text-left text-xs font-medium uppercase tracking-widest text-body/70">
                  Evento
                </th>
                {visibleChannels.map(({ channel, label, icon: Icon }) => (
                  <th
                    key={channel}
                    className="px-2 text-xs font-medium uppercase tracking-widest text-body/70"
                  >
                    <span className="flex flex-col items-center gap-1">
                      <Icon size={15} />
                      {label}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="bg-white">
                  <td className="rounded-l-2xl border border-r-0 border-line px-4 py-4">
                    <p className="font-medium text-heading">{row.name}</p>
                    <p className="text-sm text-body">{row.venue}</p>
                  </td>
                  {visibleChannels.map(({ channel }, index) => (
                    <td
                      key={channel}
                      className={`border border-l-0 border-line px-2 py-4 text-center ${
                        index === visibleChannels.length - 1 ? "rounded-r-2xl border-r" : ""
                      }`}
                    >
                      {emailPromptFor === row.id && channel === "EMAIL" ? (
                        <span className="flex items-center justify-center gap-1.5">
                          <input
                            type="email"
                            placeholder="tu@email.com"
                            value={emailInput}
                            onChange={(e) => setEmailInput(e.target.value)}
                            className="w-32 rounded-lg border border-line px-2 py-1 text-sm outline-none focus:border-ink/40"
                            autoFocus
                          />
                          <button
                            type="button"
                            onClick={() => turnOn(row, "EMAIL", emailInput.trim())}
                            disabled={!emailInput.trim()}
                            className="rounded-full bg-ink p-1.5 text-paper disabled:opacity-40"
                          >
                            <Check size={13} />
                          </button>
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleCellClick(row, channel)}
                          disabled={busyCell === cellKey(row.id, channel)}
                          className={`inline-flex h-8 w-8 items-center justify-center rounded-full border transition disabled:opacity-40 ${
                            row.channels[channel]
                              ? "border-ink bg-ink text-paper"
                              : "border-line text-body/50 hover:border-ink/30"
                          }`}
                        >
                          {row.channels[channel] ? <Check size={15} /> : <X size={15} />}
                        </button>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}

export default ManageSubscriptions;
