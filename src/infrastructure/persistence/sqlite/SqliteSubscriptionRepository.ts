import type { Database } from "better-sqlite3";
import { SubscriptionRepositoryPort } from "../../../application/ports/out/SubscriptionRepositoryPort";
import { Subscription } from "../../../domain/entities/Subscription";
import { NotificationChannel } from "../../../domain/value-objects/NotificationChannel";

interface SubscriptionRow {
  id: string;
  user_id: string;
  event_id: string;
  channel: string;
  channel_target: string;
  created_at: string;
  active: number;
}

function toDomain(row: SubscriptionRow): Subscription {
  return new Subscription({
    id: row.id,
    userId: row.user_id,
    eventId: row.event_id,
    channel: row.channel as NotificationChannel,
    channelTarget: row.channel_target,
    createdAt: new Date(row.created_at),
    active: row.active === 1,
  });
}

export class SqliteSubscriptionRepository implements SubscriptionRepositoryPort {
  constructor(private readonly db: Database) {}

  async findActiveByEventId(eventId: string): Promise<Subscription[]> {
    const rows = this.db
      .prepare<[string], SubscriptionRow>(
        "SELECT * FROM subscriptions WHERE event_id = ? AND active = 1"
      )
      .all(eventId);

    return rows.map(toDomain);
  }

  async save(subscription: Subscription): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO subscriptions (id, user_id, event_id, channel, channel_target, created_at, active)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET active = excluded.active`
      )
      .run(
        subscription.id,
        subscription.userId,
        subscription.eventId,
        subscription.channel,
        subscription.channelTarget,
        subscription.createdAt.toISOString(),
        subscription.active ? 1 : 0
      );
  }
}
