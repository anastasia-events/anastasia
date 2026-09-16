import type { Database } from "better-sqlite3";
import { EventStateRepositoryPort } from "../../../application/ports/out/EventStateRepositoryPort";
import { EventStatus, isEventStatus } from "../../../domain/value-objects/EventStatus";

interface EventStateRow {
  status: string;
}

export class SqliteEventStateRepository implements EventStateRepositoryPort {
  constructor(private readonly db: Database) {}

  async getLastKnownStatus(eventId: string): Promise<EventStatus | null> {
    const row = this.db
      .prepare<[string], EventStateRow>("SELECT status FROM event_state WHERE event_id = ?")
      .get(eventId);

    if (!row || !isEventStatus(row.status)) {
      return null;
    }
    return row.status;
  }

  async saveStatus(eventId: string, status: EventStatus): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO event_state (event_id, status, updated_at)
         VALUES (?, ?, ?)
         ON CONFLICT(event_id) DO UPDATE SET status = excluded.status, updated_at = excluded.updated_at`
      )
      .run(eventId, status, new Date().toISOString());
  }
}
