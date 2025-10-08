import { DynamicModule, Module } from '@nestjs/common';
import { Pool, PoolConfig } from 'pg';
import {
  IDrizzlePgModuleAsyncOptions,
  IDrizzlePgModuleOptions,
} from './node-postgres.types';
import {
  DRIZZLE_OPTIONS,
  DRIZZLE_PRIMARY,
  DRIZZLE_REPLICAS,
  isStandalone,
} from './node-postgres.constants';
import { DrizzlePgService } from './node-postgres.service';

@Module({})
export class DrizzlePgModule {
  static forRoot(options: IDrizzlePgModuleOptions): DynamicModule {
    return {
      module: DrizzlePgModule,
      global: options.isGlobal,
      providers: [
        DrizzlePgService,
        {
          provide: DRIZZLE_OPTIONS,
          useValue: options,
        },
        {
          provide: DRIZZLE_PRIMARY,
          useValue: this.createPrimaryPool(options),
        },
        {
          provide: DRIZZLE_REPLICAS,
          useValue: this.createReplicaPools(options),
        },
      ],
      exports: [
        DrizzlePgService,
        DRIZZLE_OPTIONS,
        DRIZZLE_PRIMARY,
        DRIZZLE_REPLICAS,
      ],
    };
  }

  static forRootAsync(options: IDrizzlePgModuleAsyncOptions): DynamicModule {
    const { imports = [], inject = [] } = options;
    return {
      imports,
      module: DrizzlePgModule,
      global: options.isGlobal,
      providers: [
        DrizzlePgService,
        {
          provide: DRIZZLE_OPTIONS,
          useFactory: options.useFactory,
          inject,
        },
        {
          provide: DRIZZLE_PRIMARY,
          useFactory: async (...args: unknown[]) => {
            const asyncOptions = await options.useFactory(...args);
            return this.createPrimaryPool(asyncOptions);
          },
          inject,
        },
        {
          provide: DRIZZLE_REPLICAS,
          useFactory: async (...args: unknown[]) => {
            const asyncOptions = await options.useFactory(...args);
            return this.createReplicaPools(asyncOptions);
          },
          inject,
        },
      ],
      exports: [
        DrizzlePgService,
        DRIZZLE_OPTIONS,
        DRIZZLE_PRIMARY,
        DRIZZLE_REPLICAS,
      ],
    };
  }

  private static createPrimaryPool(options: IDrizzlePgModuleOptions): Pool {
    const primaryConfig = isStandalone(options)
      ? options.database
      : options.primary;
    return this.createPool(primaryConfig);
  }

  private static createReplicaPools(options: IDrizzlePgModuleOptions): Pool[] {
    if (isStandalone(options)) {
      return [];
    }
    if (!options.replicas || options.replicas.length === 0) {
      return [];
    }
    return options.replicas.map((replicaConfig) => {
      return this.createPool(replicaConfig);
    });
  }

  private static createPool(config?: PoolConfig) {
    const defaultConfig: PoolConfig = {
      connectionString: process.env.DATABASE_URL,
      max: 10,
      connectionTimeoutMillis: 10_000,
      idleTimeoutMillis: 30_000,
      keepAlive: true,
      allowExitOnIdle: false,
    };
    return new Pool({
      ...defaultConfig,
      ...config,
    });
  }
}
