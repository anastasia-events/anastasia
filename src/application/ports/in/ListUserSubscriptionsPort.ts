import { Subscription } from "../../../domain/entities/Subscription";

export interface ListUserSubscriptionsPort {
  execute(userId: string): Promise<Subscription[]>;
}
