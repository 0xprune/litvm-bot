export class BotError extends Error {
  constructor(
    message: string,
    readonly code = "BOT_ERROR"
  ) {
    super(message);
    this.name = "BotError";
  }
}

export class MissingOptionalDependencyError extends BotError {
  constructor(packageName: string) {
    super(
      `${packageName} is optional and is not installed. Install it when browser fallback is needed.`,
      "MISSING_OPTIONAL_DEPENDENCY"
    );
  }
}
