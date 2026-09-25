import { useEffect, useState } from "react";
import { createTelegramSubscription, fetchEvents, type WatchedEvent } from "./api";
import "./App.css";

function App() {
  const [events, setEvents] = useState<WatchedEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [subscribingId, setSubscribingId] = useState<string | null>(null);

  useEffect(() => {
    fetchEvents()
      .then(setEvents)
      .catch(() => setError("No se pudieron cargar los eventos. Intentá de nuevo en un momento."))
      .finally(() => setLoading(false));
  }, []);

  async function handleSubscribe(eventId: string) {
    setSubscribingId(eventId);
    try {
      const { deepLink } = await createTelegramSubscription(eventId);
      window.location.href = deepLink;
    } catch {
      setError("No se pudo iniciar la suscripción. Intentá de nuevo.");
      setSubscribingId(null);
    }
  }

  return (
    <main className="page">
      <h1>Alertas de eventos</h1>
      <p className="subtitle">
        Elegí un evento y suscribite por Telegram para enterarte apenas se abra la venta.
      </p>

      {loading && <p>Cargando eventos...</p>}
      {error && <p className="error">{error}</p>}

      <ul className="event-list">
        {events.map((event) => (
          <li key={event.id} className="event-card">
            <div className="event-info">
              <h2>{event.name}</h2>
              <p className="venue">{event.venue}</p>
            </div>
            <button
              type="button"
              onClick={() => handleSubscribe(event.id)}
              disabled={subscribingId === event.id}
            >
              {subscribingId === event.id ? "Abriendo Telegram..." : "Suscribirme por Telegram"}
            </button>
          </li>
        ))}
      </ul>

      {!loading && events.length === 0 && !error && (
        <p>No hay eventos vigilados por el momento.</p>
      )}
    </main>
  );
}

export default App;
