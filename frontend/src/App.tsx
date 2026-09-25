import { ArrowRight, Check, LogOut } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { fetchEvents, fetchSubscriptions, type WatchedEvent } from "./api";
import ManageSubscriptions from "./ManageSubscriptions";
import { usePhoneSession } from "./PhoneSession";
import SubscribeModal from "./SubscribeModal";

function App() {
  const { phone: sessionPhone, logout } = usePhoneSession();
  const [view, setView] = useState<"events" | "manage">("events");
  const [events, setEvents] = useState<WatchedEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [subscribingEvent, setSubscribingEvent] = useState<WatchedEvent | null>(
    null,
  );
  const [subscribedIds, setSubscribedIds] = useState<Set<string>>(new Set());
  const [onlySubscribed, setOnlySubscribed] = useState(false);

  useEffect(() => {
    fetchEvents()
      .then(setEvents)
      .catch(() =>
        setError(
          "No se pudieron cargar los eventos. Intentá de nuevo en un momento.",
        ),
      )
      .finally(() => setLoading(false));
  }, []);

  const refreshSubscribedIds = useCallback((phone: string) => {
    fetchSubscriptions(phone)
      .then((rows) => setSubscribedIds(new Set(rows.map((row) => row.id))))
      .catch(() => {
        // Si falla, la lista principal simplemente no resalta nada — no es crítico acá.
      });
  }, []);

  useEffect(() => {
    if (!sessionPhone) {
      setSubscribedIds(new Set());
      setOnlySubscribed(false);
      return;
    }
    refreshSubscribedIds(sessionPhone);
  }, [sessionPhone, refreshSubscribedIds]);

  function handleBackFromManage() {
    setView("events");
    // Puede haber activado/cancelado canales en "Suscrito a" — refresca para
    // que la lista principal quede al día.
    if (sessionPhone) refreshSubscribedIds(sessionPhone);
  }

  if (view === "manage") {
    return <ManageSubscriptions onBack={handleBackFromManage} />;
  }

  const visibleEvents = onlySubscribed
    ? events.filter((event) => subscribedIds.has(event.id))
    : events;

  return (
    <main className="mx-auto max-w-2xl px-4 py-6 sm:py-10">
      <section className="relative overflow-hidden rounded-3xl bg-ink p-8 text-paper sm:p-12">
        <div className="absolute right-6 top-6 flex items-center gap-2">
          {sessionPhone && (
            <button
              type="button"
              onClick={logout}
              className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-sm text-paper transition hover:bg-white/10"
            >
              <LogOut size={15} />
              Cerrar sesión
            </button>
          )}
          <button
            type="button"
            onClick={() => setView("manage")}
            className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-sm text-paper transition hover:bg-white/10"
          >
            Mis suscripciones
            <ArrowRight size={15} />
          </button>
        </div>

        <h1 className="max-w-md text-5xl font-bold tracking-tight sm:text-6xl">
          Alertas de eventos
        </h1>
        <p className="mt-4 max-w-sm text-white/60">
          Elegí un evento y suscribite para enterarte apenas se abra la venta.
        </p>
      </section>

      <div className="mt-10">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs font-medium uppercase tracking-widest text-body/70">
            Eventos vigilados
          </p>

          {sessionPhone && subscribedIds.size > 0 && (
            <button
              type="button"
              onClick={() => setOnlySubscribed((prev) => !prev)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                onlySubscribed
                  ? "border-ink bg-ink text-paper"
                  : "border-line bg-white text-body hover:border-ink/30"
              }`}
            >
              <Check size={13} />
              Solo mis inscritos
            </button>
          )}
        </div>

        {loading && <p className="mt-4 text-sm">Cargando eventos...</p>}
        {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

        <ul className="mt-4 flex flex-col gap-3">
          {visibleEvents.map((event) => {
            const isSubscribed = subscribedIds.has(event.id);
            return (
              <li
                key={event.id}
                className="flex items-center justify-between gap-4 rounded-2xl border border-line bg-white p-5 transition hover:border-ink/25 sm:p-6"
              >
                <div className="min-w-0 max-w-[65%]">
                  <h2 className="text-lg font-medium text-heading">
                    {event.name}
                  </h2>
                  <p className="mt-1 text-sm text-body">{event.venue}</p>
                  {isSubscribed && (
                    <p className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-ink">
                      <Check size={13} />
                      Ya estás inscripto
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() =>
                    isSubscribed
                      ? setView("manage")
                      : setSubscribingEvent(event)
                  }
                  className={`shrink-0 rounded-full px-5 py-2.5 text-sm font-medium transition ${
                    isSubscribed
                      ? "border border-ink bg-white text-ink hover:bg-paper"
                      : "bg-ink text-paper hover:bg-ink-soft"
                  }`}
                >
                  {isSubscribed ? "Administrar suscripciones" : "Suscribir"}
                </button>
              </li>
            );
          })}
        </ul>

        {!loading && visibleEvents.length === 0 && !error && (
          <p className="mt-4 text-sm">
            {onlySubscribed
              ? "No estás inscripto a ningún evento todavía."
              : "No hay eventos vigilados por el momento."}
          </p>
        )}
      </div>

      {subscribingEvent && (
        <SubscribeModal
          event={subscribingEvent}
          onClose={() => {
            setSubscribingEvent(null);
            if (sessionPhone) refreshSubscribedIds(sessionPhone);
          }}
        />
      )}
    </main>
  );
}

export default App;
