import { randomUUID } from "crypto";

export interface UserProps {
  id: string;
  phone: string | null;
  telegramChatId: string | null;
  email: string | null;
  createdAt: Date;
}

export class User {
  readonly id: string;
  readonly phone: string | null;
  readonly telegramChatId: string | null;
  readonly email: string | null;
  readonly createdAt: Date;

  constructor(props: UserProps) {
    this.id = props.id;
    this.phone = props.phone;
    this.telegramChatId = props.telegramChatId;
    this.email = props.email;
    this.createdAt = props.createdAt;
  }

  static create(params: { phone: string }): User {
    return new User({
      id: randomUUID(),
      phone: params.phone,
      telegramChatId: null,
      email: null,
      createdAt: new Date(),
    });
  }

  withTelegramChatId(telegramChatId: string): User {
    return new User({
      id: this.id,
      phone: this.phone,
      telegramChatId,
      email: this.email,
      createdAt: this.createdAt,
    });
  }

  withEmail(email: string): User {
    return new User({
      id: this.id,
      phone: this.phone,
      telegramChatId: this.telegramChatId,
      email,
      createdAt: this.createdAt,
    });
  }
}
