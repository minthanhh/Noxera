import {
  Inject,
  Injectable,
  Logger,
  OnModuleInit,
  OnApplicationShutdown,
} from '@nestjs/common';
import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import { withReplicas } from 'drizzle-orm/pg-core';
import { Pool } from 'pg';
import {
  DRIZZLE_OPTIONS,
  DRIZZLE_PRIMARY,
  DRIZZLE_REPLICAS,
} from './node-postgres.constants';
import { isStandalone } from './node-postgres.constants';
import {
  type IDrizzlePgReplicatedOptions,
  type IDrizzlePgModuleOptions,
  IDbWithReplicas,
  IDatabasePoolEntry,
  IDrizzlePgOptions,
  GenericDrizzleDb,
} from './node-postgres.types';
import { DrizzlePgConfigurationError } from './node-postgres.errors';

@Injectable()
export class DrizzlePgService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(DrizzlePgService.name);
  private readonly isStandalone: boolean;

  private readonly primaryDb: NodePgDatabase<Record<string, unknown>>;
  private readonly dbWithReplicas!: IDbWithReplicas;
  private readonly registeredPools: Map<string, IDatabasePoolEntry> = new Map();

  constructor(
    @Inject(DRIZZLE_PRIMARY)
    private readonly primaryPool: Pool,
    @Inject(DRIZZLE_REPLICAS)
    private readonly replicaPools: Pool[],
    @Inject(DRIZZLE_OPTIONS)
    private readonly options: IDrizzlePgModuleOptions,
  ) {
    this.isStandalone = isStandalone(this.options);
    this.primaryDb = this.initializeDrizzlePg({
      pool: this.primaryPool,
      schema: this.options.schema,
      name: 'primary',
    });
    if (!this.isStandalone) {
      this.dbWithReplicas = this.initializeReplicas();
    }
  }

  async onModuleInit() {
    this.logger.log('🚀 DrizzleService initializing...');
    await this.verifyConnections();
  }

  async onApplicationShutdown(signal?: string) {
    this.logger.log(`🔴 Shutting down DrizzleService (${signal})...`);
    await this.closeAll();
  }

  private initializeDrizzlePg(options: IDrizzlePgOptions) {
    const { pool, name, ...restOptions } = options;
    this.registeredPools.set(name, { name, pool });
    return drizzle(pool, {
      logger: {
        logQuery: (query, params) => {
          this.logger.debug(`💾 ${query} -- ${JSON.stringify(params)}`);
        },
      },
      ...restOptions,
    });
  }

  private initializeReplicas() {
    const { replicas } = this.options as IDrizzlePgReplicatedOptions;
    const replicasLength = replicas.length;

    if (replicasLength === 0) {
      throw new DrizzlePgConfigurationError(
        '"replicas" must be a non-empty array when running in replicated mode.',
      );
    }
    this.logger.log(`📊 Initialized ${replicasLength} replica(s)`);

    const replicaDbs: GenericDrizzleDb[] = replicas.map(
      (replicaConfig, index) => {
        return this.initializeDrizzlePg({
          pool: this.replicaPools[index],
          schema: this.options.schema,
          name: replicaConfig.name,
        });
      },
    );

    return withReplicas(
      this.primaryDb,
      replicaDbs as [
        NodePgDatabase<Record<string, unknown>>,
        ...NodePgDatabase<Record<string, unknown>>[],
      ],
    );
  }

  async verifyConnections(): Promise<void> {
    this.logger.log('🔍 Verifying all database connections...');
    const pools = Array.from(this.registeredPools.values());
    const checkPromises = pools.map(async ({ name, pool }) => {
      const client = await pool.connect();
      await client.query('SELECT 1 as connection_test');
      client.release();
      this.logger.log(`✅ Connection successful: ${name}`);
    });

    const result = await Promise.allSettled(checkPromises);
    const failedConnections = result
      .map((res, idx) => (res.status === 'rejected' ? pools[idx].name : null))
      .filter(Boolean);

    if (failedConnections.length > 0) {
      this.logger.error(
        `❌ Connection check failed for: ${failedConnections.join(', ')}`,
      );
      throw new DrizzlePgConfigurationError(
        `Database connection failed for: ${failedConnections.join(', ')}`,
      );
    }

    this.logger.log('✅ All database connections verified successfully');
  }

  private async closeAll(): Promise<void> {
    this.logger.log('🔻 Closing all database connections...');
    const closePromises = Array.from(this.registeredPools.values()).map(
      async ({ name, pool }) => {
        try {
          await pool.end();
          this.logger.log(`✅ Closed connection pool: ${name}`);
        } catch (error) {
          if (error instanceof Error) {
            throw new DrizzlePgConfigurationError(
              `Error closing pool "${name}": ${error.message}`,
            );
          }
        }
      },
    );

    await Promise.allSettled(closePromises);
    this.registeredPools.clear();
    this.logger.log('🧹 All pools have been closed.');
  }

  get db() {
    if (this.isStandalone) return this.primaryDb;
    return this.dbWithReplicas;
  }
}
