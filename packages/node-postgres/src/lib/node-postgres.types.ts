import { DynamicModule, ForwardReference, Type } from '@nestjs/common';
import { DrizzleConfig } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { PgWithReplicas } from 'drizzle-orm/pg-core';
import { Pool, PoolConfig } from 'pg';

export type IPgPoolConfig = PoolConfig;

export interface IPgReplicaOptions extends IPgPoolConfig {
  name: string;
}

export type IPgPrimaryOptions = IPgPoolConfig;

export interface IDrizzlePgCommonOptions {
  logging?: boolean;
  schema: Record<string, unknown>;
  isGlobal?: boolean;
}

export interface IDrizzlePgStandaloneOptions extends IDrizzlePgCommonOptions {
  mode: 'standalone';
  database: IPgPoolConfig;
}

export interface IDrizzlePgReplicatedOptions extends IDrizzlePgCommonOptions {
  mode: 'replicated';
  primary: IPgPrimaryOptions;
  replicas: IPgReplicaOptions[];
}

export type IDrizzlePgModuleOptions =
  | IDrizzlePgStandaloneOptions
  | IDrizzlePgReplicatedOptions;

export interface IDrizzlePgModuleAsyncOptions {
  imports?: Array<
    Type<any> | DynamicModule | Promise<DynamicModule> | ForwardReference
  >;
  useFactory: (
    ...args: any[]
  ) => Promise<IDrizzlePgModuleOptions> | IDrizzlePgModuleOptions;
  inject?: any[];
  isGlobal?: boolean;
}

export interface IReplicaInstance {
  name: string;
  pool: Pool;
  db: NodePgDatabase<Record<string, unknown>>;
  weight: number;
  priority: number;
  isHealthy: boolean;
}

export interface IDatabasePoolEntry {
  name: string;
  pool: Pool;
}

export type IDbWithReplicas = PgWithReplicas<
  NodePgDatabase<Record<string, unknown>>
>;

export interface IDrizzlePgOptions
  extends DrizzleConfig<Record<string, unknown>> {
  name: string;
  pool: Pool;
}

export type GenericDrizzleDb = NodePgDatabase<Record<string, unknown>>;