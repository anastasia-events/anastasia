import { Check, Mail, Send, MessageCircle, X } from "lucide-react";
import { useEffect, useState, type ComponentType } from "react";
import {
  createEmailSubscription,
  createTelegramSubscription,
  createWhatsappSubscription,
  startSession,
  type Channel,
  type WatchedEvent,
} from "./api";
import { usePhoneSession } from "./PhoneSession";
import { useEnabledChannels } from "./useEnabledChannels";

const CHANNEL_OPTIONS: { channel: Channel; label: string; icon: ComponentType<{ size?: number }> }[] = [
  { channel: "WHATSAPP", label: "WhatsApp", icon: MessageCircle },
  { channel: "TELEGRAM", label: "Telegram", icon: Send },
  { channel: "EMAIL", label: "Email", icon: Mail },
];

interface SubscribeModalProps {
  event: WatchedEvent;
  onClose: () => void;
}

function SubscribeModal({ event, onClose }: SubscribeModalProps) {
  const {
    phone: sessionPhone,
    email: sessionEmail,
    setPhone: setSessionPhone,
    setEmail: setSessionEmail,
  } = usePhoneSession();
  const [step, setStep] = useState<"phone" | "channels" | "done">(
    sessionPhone ? "channels" : "phone"
  );
  const [phone, setPhone] = useState(sessionPhone ?? "");
  const [selected, setSelected] = useState<Set<Channel>>(new Set());
  const [email, setEmail] = useState(sessionEmail ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [telegramDeepLink, setTelegramDeepLink] = useState<string | null>(null);
  const enabledChannels = useEnabledChannels();

  // El email de cuenta puede llegar un momento después (se trae en cuanto se
  // conoce el teléfono) — si todavía no escribiste nada, se prellena solo.
  useEffect(() => {
    if (sessionEmail) setEmail((current) => current || sessionEmail);
  }, [sessionEmail]);

  function toggleChannel(channel: Channel) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(channel)) next.delete(channel);
      else next.add(channel);
      return next;
    });
  }

  async function handleConfirmPhone() {
    if (!phone.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const normalized = await startSession(phone.trim());
      setPhone(normalized);
      setSessionPhone(normalized);
      setStep("channels");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo validar el número.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleConfirmChannels() {
    if (selected.size === 0) return;
    if (selected.has("EMAIL") && !email.trim()) {
      setError("Ingresá un email para ese medio.");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const instantChannels = [...selected].filter((c) => c !== "TELEGRAM");
      await Promise.all(
        instantChannels.map(async (channel) => {
          if (channel === "EMAIL") {
            const result = await createEmailSubscription(event.id, phone.trim(), email.trim());
            setSessionEmail(result.email);
            return result;
          }
          return createWhatsappSubscription(event.id, phone.trim());
        })
      );

      if (selected.has("TELEGRAM")) {
        const result = await createTelegramSubscription(event.id, phone.trim());
        // Si el chat ya estaba vinculado de antes, queda activado al toque
        // (igual que WhatsApp/Email); si no, mostramos el link para que lo
        // abra cuando quiera, en vez de redirigirlo solo.
        if (!result.linked) setTelegramDeepLink(result.deepLink);
      }

      setStep("done");
    } catch {
      setError("No se pudo completar la suscripción. Intentá de nuevo.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-10 flex items-center justify-center bg-ink/60 p-5 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-sm rounded-2xl bg-white p-7 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar"
          className="absolute right-4 top-4 text-body transition hover:text-heading"
        >
          <X size={20} />
        </button>

        <h2 className="pr-6 text-lg font-medium text-heading">{event.name}</h2>
        <p className="mt-1 text-sm text-body">{event.venue}</p>

        {step === "phone" && (
          <>
            <p className="mt-6 text-xs font-medium uppercase tracking-widest text-body/70">
              Identificate con tu celu
            </p>
            <input
              type="tel"
              className="mt-3 w-full rounded-xl border border-line bg-white px-4 py-2.5 text-heading outline-none focus:border-ink/40"
              placeholder="Ej: 3001234567"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleConfirmPhone()}
              autoFocus
            />
            <button
              type="button"
              onClick={handleConfirmPhone}
              disabled={submitting || !phone.trim()}
              className="mt-4 w-full rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-paper transition hover:bg-ink-soft disabled:opacity-40"
            >
              {submitting ? "Validando..." : "Continuar"}
            </button>
            {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
          </>
        )}

        {step === "channels" && (
          <>
            <p className="mt-6 text-xs font-medium uppercase tracking-widest text-body/70">
              ¿Por dónde? Podés elegir varias
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {CHANNEL_OPTIONS.filter(({ channel }) => enabledChannels.has(channel)).map(({ channel, label, icon: Icon }) => {
                const isSelected = selected.has(channel);
                return (
                  <button
                    type="button"
                    key={channel}
                    onClick={() => toggleChannel(channel)}
                    className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition ${
                      isSelected
                        ? "border-ink bg-ink text-paper"
                        : "border-line bg-white text-body hover:border-ink/30"
                    }`}
                  >
                    <Icon size={16} />
                    {label}
                  </button>
                );
              })}
            </div>

            {selected.has("EMAIL") && (
              <input
                type="email"
                className="mt-3 w-full rounded-xl border border-line bg-white px-4 py-2.5 text-heading outline-none focus:border-ink/40"
                placeholder="tu@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            )}

            {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

            <button
              type="button"
              onClick={handleConfirmChannels}
              disabled={submitting || selected.size === 0}
              className="mt-4 w-full rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-paper transition hover:bg-ink-soft disabled:opacity-40"
            >
              {submitting ? "Suscribiendo..." : "Confirmar"}
            </button>
          </>
        )}

        {step === "done" && (
          <>
            <p className="mt-6 flex items-center gap-2 text-heading">
              <Check size={18} className="text-emerald-600" />
              ¡Listo! Ya quedaste suscripto.
            </p>

            {telegramDeepLink && (
              <div className="mt-4 rounded-xl border border-line bg-paper p-4">
                <p className="text-sm text-body">
                  Para avisarte por Telegram también, abrí el bot y tocá <strong>Start</strong>.
                </p>
                <a
                  href={telegramDeepLink}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 inline-flex items-center gap-2 rounded-full bg-ink px-4 py-2 text-sm font-medium text-paper transition hover:bg-ink-soft"
                >
                  <Send size={15} />
                  Abrir Telegram
                </a>
              </div>
            )}

            <button
              type="button"
              onClick={onClose}
              className="mt-4 w-full rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-paper transition hover:bg-ink-soft"
            >
              Cerrar
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export default SubscribeModal;
