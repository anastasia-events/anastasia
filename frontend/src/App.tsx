import { ArrowRight, Check, LogOut } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { fetchEvents, fetchSubscriptions, type WatchedEvent } from "./api";
import ManageSubscriptions from "./ManageSubscriptions";
import { usePhoneSession } from "./PhoneSession";
import SubscribeModal from "./SubscribeModal";

type EventFilter = "all" | "subscribed" | "unsubscribed";

const FILTER_OPTIONS: { value: EventFilter; label: string }[] = [
  { value: "all", label: "Todos" },
  { value: "subscribed", label: "Mis inscritos" },
  { value: "unsubscribed", label: "Sin inscribir" },
];

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
  const [filter, setFilter] = useState<EventFilter>("all");

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
      setFilter("all");
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

  const visibleEvents = events.filter((event) => {
    if (filter === "subscribed") return subscribedIds.has(event.id);
    if (filter === "unsubscribed") return !subscribedIds.has(event.id);
    return true;
  });

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
          Anastasia
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

          {sessionPhone && (
            <div
              role="radiogroup"
              aria-label="Filtrar eventos"
              className="inline-flex rounded-full border border-line bg-white p-0.5"
            >
              {FILTER_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={filter === option.value}
                  onClick={() => setFilter(option.value)}
                  className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                    filter === option.value
                      ? "bg-ink text-paper"
                      : "text-body hover:text-heading"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
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
                      Ya estás inscrito
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
            {filter === "subscribed"
              ? "No estás inscrito a ningún evento todavía."
              : filter === "unsubscribed"
                ? "Ya estás inscrito a todos los eventos vigilados."
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
