# Plan MVP — Sistema de Alertas Tempranas de Eventos

## 1. Objetivo del MVP

Sistema que monitorea eventos específicos en Ticketmaster (extensible a otras
ticketeras en el futuro), detecta cambios de estado relevantes (ej. apertura
de venta) y notifica a los usuarios suscritos a ese evento por un canal
instantáneo (Telegram en el MVP). La llamada con audio pregrabado (Twilio)
queda **definida como puerto/adaptador pero sin implementar** en esta fase.

Modelo de negocio (fuera del alcance técnico de este documento, pero
condiciona el diseño): notificación instantánea, cobro por notificación
enviada (no suscripción fija), sin ejecución de compra por parte del sistema
— la compra la hace siempre el usuario final.

## 2. Por qué arquitectura hexagonal aquí

El dominio ("vigilar disponibilidad y avisar") es estable, pero **todo lo
que lo rodea va a cambiar**: hoy es Ticketmaster, mañana otra ticketera; hoy
es Telegram, mañana es Twilio o WhatsApp; hoy es un JSON en disco, mañana es
Postgres. Separar el núcleo (dominio + casos de uso) de los detalles
(proveedores de eventos, canales de notificación, persistencia) permite
intercambiar cualquiera de esas piezas sin tocar la lógica de negocio.

```
                    ┌─────────────────────────────┐
                    │        Adaptadores           │
                    │   (entrada / driving)         │
                    │  - CLI / Scheduler runner     │
                    │  - (futuro) API REST/Webhook   │
                    └───────────────┬───────────────┘
                                    │ usa
                    ┌───────────────▼───────────────┐
                    │      Puertos de entrada         │
                    │  (interfaces de casos de uso)   │
                    └───────────────┬───────────────┘
                    ┌───────────────▼───────────────┐
                    │         DOMINIO / CORE          │
                    │  Entidades, Value Objects,      │
                    │  Casos de uso (Application)     │
                    └───────────────┬───────────────┘
                    ┌───────────────▼───────────────┐
                    │      Puertos de salida          │
                    │ (interfaces que el dominio pide) │
                    └───────────────┬───────────────┘
                    ┌───────────────▼───────────────┐
                    │        Adaptadores               │
                    │   (salida / driven)              │
                    │  - TicketmasterEventProvider     │
                    │  - TelegramNotifier              │
                    │  - TwilioCallNotifier (stub)     │
                    │  - SqliteEventStateRepository    │
                    │  - SqliteSubscriptionRepository  │
                    └─────────────────────────────────┘
```

## 3. Estructura de carpetas propuesta

```
event-watcher/
├── src/
│   ├── domain/
│   │   ├── entities/
│   │   │   ├── Event.ts
│   │   │   ├── Subscription.ts
│   │   │   └── NotificationRecord.ts
│   │   ├── value-objects/
│   │   │   ├── EventStatus.ts        # ONSALE | OFFSALE | CANCELLED | RESCHEDULED
│   │   │   └── NotificationChannel.ts # TELEGRAM | CALL (futuro)
│   │   └── errors/
│   │       └── DomainErrors.ts
│   │
│   ├── application/
│   │   ├── use-cases/
│   │   │   ├── CheckEventAvailability.ts
│   │   │   ├── NotifySubscribers.ts
│   │   │   └── SubscribeUserToEvent.ts
│   │   └── ports/
│   │       ├── in/
│   │       │   ├── CheckEventAvailabilityPort.ts
│   │       │   └── SubscribeUserToEventPort.ts
│   │       └── out/
│   │           ├── EventProviderPort.ts
│   │           ├── NotificationPort.ts
│   │           ├── EventStateRepositoryPort.ts
│   │           └── SubscriptionRepositoryPort.ts
│   │
│   ├── infrastructure/
│   │   ├── event-providers/
│   │   │   └── ticketmaster/
│   │   │       ├── TicketmasterEventProvider.ts   # implementa EventProviderPort
│   │   │       └── TicketmasterApiClient.ts
│   │   ├── notifiers/
│   │   │   ├── telegram/
│   │   │   │   └── TelegramNotifier.ts            # implementa NotificationPort
│   │   │   └── twilio/
│   │   │       └── TwilioCallNotifier.ts          # STUB — implementa la interfaz,
│   │   │                                          # lanza "not implemented"
│   │   ├── persistence/
│   │   │   ├── sqlite/
│   │   │   │   ├── SqliteEventStateRepository.ts
│   │   │   │   └── SqliteSubscriptionRepository.ts
│   │   │   └── migrations/
│   │   └── scheduler/
│   │       └── PollingScheduler.ts                # dispara CheckEventAvailability cada N seg
│   │
│   ├── config/
│   │   ├── env.ts
│   │   └── container.ts        # composition root: aquí se "conectan" los adaptadores
│   │                            #   a los puertos (inyección de dependencias manual)
│   │
│   └── main.ts                 # entry point: arranca el scheduler
│
├── test/
│   ├── domain/
│   ├── application/
│   └── infrastructure/
├── .env.example
├── package.json
└── tsconfig.json
```

## 4. Dominio

### Entidades

- **Event**: `id`, `providerId` (ej. `ticketmaster:G5v...`), `name`, `venue`,
  `status` (EventStatus), `onSaleDate`, `lastCheckedAt`, `lastKnownStatus`.
- **Subscription**: `id`, `userId`, `eventId`, `channel` (NotificationChannel),
  `channelTarget` (ej. chatId de Telegram), `createdAt`, `active`.
- **NotificationRecord**: `id`, `subscriptionId`, `eventId`, `sentAt`,
  `channel`, `status` (SENT | FAILED), `costCents` (para el cobro por
  notificación).

### Value Objects

- **EventStatus**: enum cerrado, para no dejar que cualquier string entre al
  dominio.
- **NotificationChannel**: enum cerrado — hoy solo `TELEGRAM`, pero ya con
  `CALL` reservado para cuando se implemente Twilio.

## 5. Puertos (interfaces)

### Puertos de salida (lo que el dominio necesita del mundo exterior)

```
EventProviderPort
  - findEventById(providerEventId: string): Promise<Event>
  - checkStatus(providerEventId: string): Promise<EventStatus>

NotificationPort
  - send(subscription: Subscription, event: Event): Promise<NotificationResult>

EventStateRepositoryPort
  - getLastKnownStatus(eventId: string): Promise<EventStatus | null>
  - saveStatus(eventId: string, status: EventStatus): Promise<void>

SubscriptionRepositoryPort
  - findActiveByEventId(eventId: string): Promise<Subscription[]>
  - save(subscription: Subscription): Promise<void>
```

### Puertos de entrada (casos de uso expuestos)

```
CheckEventAvailabilityPort
  - execute(eventId: string): Promise<{ changed: boolean; newStatus: EventStatus }>

SubscribeUserToEventPort
  - execute(userId: string, providerEventId: string, channel: NotificationChannel, channelTarget: string): Promise<Subscription>
```

## 6. Casos de uso (lógica de aplicación)

**CheckEventAvailability**
1. Pide el estado actual al `EventProviderPort` (adaptador Ticketmaster).
2. Compara contra el último estado guardado (`EventStateRepositoryPort`).
3. Si cambió y el nuevo estado es relevante (ej. pasó a `ONSALE`), dispara
   `NotifySubscribers`.
4. Guarda el nuevo estado.

**NotifySubscribers**
1. Obtiene las suscripciones activas para ese evento
   (`SubscriptionRepositoryPort`).
2. Para cada una, resuelve el adaptador de notificación según su `channel`
   (hoy solo Telegram; el "resolver" ya queda listo para sumar Twilio sin
   tocar este caso de uso).
3. Registra el `NotificationRecord` con el resultado (para poder facturar
   por notificación enviada más adelante).

**SubscribeUserToEvent**
1. Verifica que el evento exista (vía `EventProviderPort.findEventById`, o
   ya en caché local).
2. Crea la `Subscription` y la persiste.

## 7. Adaptadores del MVP

| Puerto | Adaptador MVP | Estado |
|---|---|---|
| `EventProviderPort` | `TicketmasterEventProvider` | Implementar ahora |
| `NotificationPort` | `TelegramNotifier` | Implementar ahora |
| `NotificationPort` | `TwilioCallNotifier` | Solo interfaz + stub, sin lógica real |
| `EventStateRepositoryPort` | `SqliteEventStateRepository` | Implementar ahora |
| `SubscriptionRepositoryPort` | `SqliteSubscriptionRepository` | Implementar ahora |
| Disparador | `PollingScheduler` (cron cada N segundos) | Implementar ahora |

El `TwilioCallNotifier` se crea desde ya como clase que implementa
`NotificationPort` pero cuyo método `send()` lanza un error controlado
(`NotImplementedError`) o hace un `console.log` simulando el envío. Así el
`NotificationChannel.CALL` puede existir en el dominio y en el "resolver de
canal" desde hoy, sin bloquear el resto del sistema.

## 8. Stack técnico sugerido

- **Node.js + TypeScript** (los tipos ayudan mucho a mantener los puertos
  honestos con arquitectura hexagonal).
- **node-cron** o similar para el `PollingScheduler`.
- **better-sqlite3** o **Prisma + SQLite** para persistencia (fácil de migrar
  a Postgres después sin tocar el dominio, solo el adaptador).
- **node-telegram-bot-api** para el `TelegramNotifier`.
- **dotenv** para configuración vía `.env`.
- Tests unitarios del dominio y casos de uso con **mocks de los puertos**
  (no se necesita levantar SQLite ni llamar a Ticketmaster real para probar
  la lógica).

## 9. Variables de entorno (`.env.example`)

```
TICKETMASTER_API_KEY=
TELEGRAM_BOT_TOKEN=
POLLING_INTERVAL_SECONDS=15
DATABASE_PATH=./data/event-watcher.sqlite
# Reservado para fase futura, no usado aún:
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_FROM_NUMBER=
```

## 10. Alcance explícito del MVP (para Claude Code)

**Incluido ahora:**
- Consumo de Ticketmaster Discovery API para un conjunto de eventos
  configurados.
- Detección de cambio de estado y persistencia del último estado conocido.
- Notificación por Telegram a los suscriptores de cada evento.
- Alta de suscripciones (usuario ↔ evento ↔ canal).
- Estructura de carpetas y puertos ya preparada para sumar más proveedores
  de eventos (otras ticketeras) y más canales de notificación (Twilio,
  WhatsApp) sin refactor del dominio.

**Explícitamente fuera de alcance ahora:**
- Implementación real de Twilio (solo la interfaz/stub).
- Cualquier lógica de compra automática de tickets.
- Cobro/facturación (se registra el `NotificationRecord` con costo, pero no
  se integra pasarela de pago todavía).
- Panel/UI — por ahora todo vía scripts/CLI y configuración manual de
  eventos y suscripciones.

## 11. Siguiente paso sugerido para Claude Code

1. Inicializar el proyecto Node + TypeScript con esta estructura de
   carpetas.
2. Implementar el dominio (entidades + value objects) sin ninguna
   dependencia externa.
3. Implementar los puertos como interfaces TypeScript.
4. Implementar los casos de uso contra los puertos (con mocks/fakes en
   tests).
5. Implementar `TicketmasterEventProvider` y `TelegramNotifier` como
   adaptadores concretos.
6. Implementar `SqliteEventStateRepository` y
   `SqliteSubscriptionRepository`.
7. Armar el `composition root` (`container.ts`) y el `PollingScheduler`.
8. Probar end-to-end con un evento real de la cuenta de prueba de
   Ticketmaster.
