
import { Test, TestingModule } from '@nestjs/testing';
import { Pool } from 'pg';
import { DrizzlePgService } from './node-postgres.service';
import {
  DRIZZLE_OPTIONS,
  DRIZZLE_PRIMARY,
  DRIZZLE_REPLICAS,
} from './node-postgres.constants';
import { DrizzlePgConfigurationError } from './node-postgres.errors';
import { IDrizzlePgModuleOptions } from './node-postgres.types';

// Mock Pool to return a new mock object for each instance
jest.mock('pg', () => {
  const createMockPool = () => ({
    connect: jest.fn(),
    query: jest.fn(),
    end: jest.fn(),
    release: jest.fn(),
  });
  return { Pool: jest.fn().mockImplementation(createMockPool) };
});

// Mock Drizzle
jest.mock('drizzle-orm/node-postgres', () => ({
  drizzle: jest.fn(() => ({})),
}));

jest.mock('drizzle-orm/pg-core', () => ({
  withReplicas: jest.fn(() => ({})),
}));

describe('DrizzlePgService', () => {
  let service: DrizzlePgService;
  let primaryPool: Pool;
  let replicaPools: Pool[];

  const mockClient = {
    query: jest.fn().mockResolvedValue({ rows: [{ connection_test: 1 }] }),
    release: jest.fn(),
  };

  beforeEach(() => {
    primaryPool = new Pool();
    (primaryPool.connect as jest.Mock).mockResolvedValue(mockClient);
    replicaPools = [new Pool()];
    (replicaPools[0].connect as jest.Mock).mockResolvedValue(mockClient);
  });

  afterEach(() => {
    // Use resetAllMocks for complete isolation between tests
    jest.resetAllMocks();
  });

  describe('Standalone Mode', () => {
    beforeEach(async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          DrizzlePgService,
          {
            provide: DRIZZLE_PRIMARY,
            useValue: primaryPool,
          },
          {
            provide: DRIZZLE_REPLICAS,
            useValue: [],
          },
          {
            provide: DRIZZLE_OPTIONS,
            useValue: {
              mode: 'standalone',
              database: { host: 'localhost' },
              schema: {},
            } as IDrizzlePgModuleOptions,
          },
        ],
      }).compile();

      service = module.get<DrizzlePgService>(DrizzlePgService);
    });

    it('should be defined', () => {
      expect(service).toBeDefined();
    });

    it('should initialize and verify primary connection on module init', async () => {
      await service.onModuleInit();
      expect(primaryPool.connect).toHaveBeenCalledTimes(1);
      expect(mockClient.query).toHaveBeenCalledWith('SELECT 1 as connection_test');
    });

    it('should close the primary connection on application shutdown', async () => {
      await service.onModuleInit();
      await service.onApplicationShutdown('test');
      expect(primaryPool.end).toHaveBeenCalledTimes(1);
    });

    it('should return the primary db instance', () => {
      expect(service.db).toBeDefined();
    });

    it('should throw configuration error if connection check fails', async () => {
      (primaryPool.connect as jest.Mock).mockRejectedValueOnce(
        new Error('Connection failed'),
      );
      await expect(service.onModuleInit()).rejects.toThrow(
        DrizzlePgConfigurationError,
      );
    });
  });

  describe('Replicated Mode', () => {
    beforeEach(async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          DrizzlePgService,
          {
            provide: DRIZZLE_PRIMARY,
            useValue: primaryPool,
          },
          {
            provide: DRIZZLE_REPLICAS,
            useValue: replicaPools,
          },
          {
            provide: DRIZZLE_OPTIONS,
            useValue: {
              mode: 'replicated',
              primary: { host: 'localhost' },
              replicas: [{ name: 'replica1', host: 'localhost' }],
              schema: {},
            } as IDrizzlePgModuleOptions,
          },
        ],
      }).compile();

      service = module.get<DrizzlePgService>(DrizzlePgService);
    });

    it('should initialize and verify primary and replica connections', async () => {
      await service.onModuleInit();
      expect(primaryPool.connect).toHaveBeenCalledTimes(1);
      expect(replicaPools[0].connect).toHaveBeenCalledTimes(1);
      expect(mockClient.query).toHaveBeenCalledTimes(2);
    });

    it('should close all connections on shutdown', async () => {
      await service.onModuleInit();
      await service.onApplicationShutdown('test');
      expect(primaryPool.end).toHaveBeenCalledTimes(1);
      expect(replicaPools[0].end).toHaveBeenCalledTimes(1);
    });

    it('should return the db instance with replicas', () => {
      expect(service.db).toBeDefined();
    });

    it('should throw configuration error if a replica connection fails', async () => {
      // Make the replica connection fail
      (replicaPools[0].connect as jest.Mock).mockRejectedValueOnce(
        new Error('Replica connection failed'),
      );

      // The onModuleInit should now reject with a specific error message
      await expect(service.onModuleInit()).rejects.toThrow(
        new DrizzlePgConfigurationError(
          'Database connection failed for: replica1',
        ),
      );
    });
  });
});

