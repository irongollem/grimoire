/** A refusal the caller can act on: the status says whose fault it is, the message says what to change. */
export class FightCommandError extends Error {
  constructor(
    public readonly status: 400 | 404 | 409,
    message: string,
  ) {
    super(message);
    this.name = "FightCommandError";
  }
}
