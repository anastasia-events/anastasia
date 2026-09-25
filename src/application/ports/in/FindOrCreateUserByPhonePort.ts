import { User } from "../../../domain/entities/User";

export interface FindOrCreateUserByPhonePort {
  execute(phone: string): Promise<User>;
}
