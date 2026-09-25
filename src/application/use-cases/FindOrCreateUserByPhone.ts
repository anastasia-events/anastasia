import { User } from "../../domain/entities/User";
import { FindOrCreateUserByPhonePort } from "../ports/in/FindOrCreateUserByPhonePort";
import { UserRepositoryPort } from "../ports/out/UserRepositoryPort";

export class FindOrCreateUserByPhone implements FindOrCreateUserByPhonePort {
  constructor(private readonly userRepository: UserRepositoryPort) {}

  async execute(phone: string): Promise<User> {
    const existing = await this.userRepository.findByPhone(phone);
    if (existing) return existing;

    const user = User.create({ phone });
    await this.userRepository.save(user);
    return user;
  }
}
