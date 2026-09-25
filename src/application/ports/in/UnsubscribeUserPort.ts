export type UnsubscribeResult =
  | { ok: true }
  | { ok: false; reason: "not_found" | "not_owner" };

export interface UnsubscribeUserPort {
  execute(subscriptionId: string, userId: string): Promise<UnsubscribeResult>;
}
