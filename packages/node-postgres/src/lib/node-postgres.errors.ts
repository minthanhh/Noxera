export class DrizzlePgConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DrizzlePgConfigurationError';
  }
}
