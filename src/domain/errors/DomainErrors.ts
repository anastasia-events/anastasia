export class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
  }
}

export class EventNotFoundError extends DomainError {
  constructor(providerEventId: string) {
    super(`Evento no encontrado en el proveedor: ${providerEventId}`);
  }
}

export class NotImplementedError extends DomainError {
  constructor(feature: string) {
    super(`No implementado todavía: ${feature}`);
  }
}
