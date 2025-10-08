import {
  IDrizzlePgModuleOptions,
  IDrizzlePgStandaloneOptions,
} from './node-postgres.types';

export const DRIZZLE_PRIMARY = Symbol('DRIZZLE_PRIMARY');
export const DRIZZLE_REPLICAS = Symbol('DRIZZLE_REPLICAS');
export const DRIZZLE_OPTIONS = Symbol('DRIZZLE_OPTIONS');

export const DrizzlePgMode = {
  STANDALONE: 'standalone',
  REPLICATED: 'replicated',
} as const;

export const isStandalone = (
  options: IDrizzlePgModuleOptions,
): options is IDrizzlePgStandaloneOptions => {
  return options.mode === DrizzlePgMode.STANDALONE;
};
