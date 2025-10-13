# NestJS Drizzle PG Module

Một module NestJS mạnh mẽ và dễ sử dụng để tích hợp [Drizzle ORM](https://orm.drizzle.team/) với `node-postgres`. Module này được thiết kế để đơn giản hóa việc thiết lập kết nối cơ sở dữ liệu PostgreSQL, hỗ trợ cả cấu hình cơ sở dữ liệu đơn (standalone) và cấu hình có bản sao (primary/replica).

## Tính năng

-   ✅ Tích hợp liền mạch với hệ sinh thái NestJS.
-   ✅ Hỗ trợ Drizzle ORM và `node-postgres`.
-   ✅ Cấu hình cho cả cơ sở dữ liệu **đơn** và **có bản sao** (primary/replica).
-   ✅ Tự động quản lý vòng đời kết nối (connection pooling).
-   ✅ Khởi tạo module đồng bộ (`forRoot`) và bất đồng bộ (`forRootAsync`).
-   ✅ Ghi log cho các truy vấn (query logging).
-   ✅ Kiểm tra kết nối khi khởi tạo module.

## Cài đặt

```bash
npm install @your-npm-scope/node-postgres pg drizzle-orm
# hoặc
yarn add @your-npm-scope/node-postgres pg drizzle-orm
```

Bạn cũng cần cài đặt `drizzle-kit` nếu muốn sử dụng Drizzle Studio hoặc tạo các file migration:

```bash
npm install -D drizzle-kit
# hoặc
yarn add -D drizzle-kit
```

## Cách sử dụng

Trước tiên, bạn cần định nghĩa schema của Drizzle. Ví dụ:

**`src/schema.ts`**

```typescript
import { pgTable, serial, text, varchar } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  fullName: text('full_name'),
  phone: varchar('phone', { length: 256 }),
});

// Bạn có thể export tất cả schema dưới dạng một đối tượng để dễ dàng import
export const schema = { users };
```

### 1. Chế độ Standalone (Cơ sở dữ liệu đơn)

Sử dụng chế độ này khi bạn chỉ có một cơ sở dữ liệu duy nhất.

**`src/app.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { DrizzlePgModule } from '@your-npm-scope/node-postgres';
import * as schema from './schema';

@Module({
  imports: [
    DrizzlePgModule.forRoot({
      mode: 'standalone',
      isGlobal: true, // Làm cho module có sẵn trên toàn cục
      schema: schema,
      database: {
        connectionString: process.env.DATABASE_URL,
        // Các tùy chọn khác của node-postgres Pool...
      },
    }),
  ],
})
export class AppModule {}
```

### 2. Chế độ Replicated (Cơ sở dữ liệu có bản sao)

Sử dụng chế độ này khi bạn có một cơ sở dữ liệu chính (primary) cho các thao tác ghi và một hoặc nhiều cơ sở dữ liệu bản sao (replicas) cho các thao tác đọc.

**`src/app.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { DrizzlePgModule } from '@your-npm-scope/node-postgres';
import * as schema from './schema';

@Module({
  imports: [
    DrizzlePgModule.forRoot({
      mode: 'replicated',
      isGlobal: true,
      schema: schema,
      primary: {
        connectionString: process.env.PRIMARY_DATABASE_URL,
      },
      replicas: [
        {
          name: 'replica1', // Tên định danh cho replica
          connectionString: process.env.REPLICA1_DATABASE_URL,
        },
        {
          name: 'replica2',
          connectionString: process.env.REPLICA2_DATABASE_URL,
        },
      ],
    }),
  ],
})
export class AppModule {}
```

### 3. Cấu hình bất đồng bộ

Sử dụng `forRootAsync` khi cấu hình của bạn phụ thuộc vào các module hoặc dịch vụ khác (ví dụ: `ConfigModule`).

**`src/app.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { DrizzlePgModule } from '@your-npm-scope/node-postgres';
import * as schema from './schema';

@Module({
  imports: [
    ConfigModule.forRoot(),
    DrizzlePgModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      isGlobal: true,
      useFactory: async (configService: ConfigService) => ({
        mode: 'standalone',
        schema: schema,
        database: {
          connectionString: configService.get<string>('DATABASE_URL'),
        },
      }),
    }),
  ],
})
export class AppModule {}
```

### 4. Sử dụng `DrizzlePgService`

Sau khi module được cấu hình, bạn có thể inject `DrizzlePgService` vào các service hoặc controller của mình để tương tác với cơ sở dữ liệu.

**`src/users/users.service.ts`**

```typescript
import { Injectable } from '@nestjs/common';
import { DrizzlePgService } from '@your-npm-scope/node-postgres';
import { users } from '../schema';
import { eq } from 'drizzle-orm';

@Injectable()
export class UsersService {
  // `this.db` sẽ là một instance của Drizzle
  // với các bản sao nếu được cấu hình
  private readonly db = this.drizzleService.db;

  constructor(private readonly drizzleService: DrizzlePgService) {}

  async findUserById(id: number) {
    // Drizzle sẽ tự động sử dụng replica cho truy vấn này
    const result = await this.db.query.users.findFirst({
      where: eq(users.id, id),
    });
    return result;
  }

  async createUser(fullName: string, phone: string) {
    // Drizzle sẽ tự động sử dụng primary cho truy vấn này
    const result = await this.db.insert(users).values({ fullName, phone }).returning();
    return result[0];
  }
}
```

## API

### `DrizzlePgModule.forRoot(options)`

Cấu hình module một cách đồng bộ.

-   `options`: `IDrizzlePgModuleOptions`
    -   `mode`: `'standalone'` | `'replicated'`
    -   `isGlobal?`: `boolean` - Nếu `true`, module sẽ được đăng ký trên toàn cục.
    -   `schema`: `Record<string, unknown>` - Đối tượng schema từ Drizzle.
    -   `database?`: `IPgPoolConfig` - (Chỉ cho `standalone`) Cấu hình pool cho cơ sở dữ liệu.
    -   `primary?`: `IPgPrimaryOptions` - (Chỉ cho `replicated`) Cấu hình pool cho cơ sở dữ liệu chính.
    -   `replicas?`: `IPgReplicaOptions[]` - (Chỉ cho `replicated`) Mảng cấu hình cho các cơ sở dữ liệu bản sao.

### `DrizzlePgModule.forRootAsync(options)`

Cấu hình module một cách bất đồng bộ.

-   `options`: `IDrizzlePgModuleAsyncOptions`
    -   `imports?`: Mảng các module cần thiết.
    -   `inject?`: Mảng các provider cần inject vào `useFactory`.
    -   `useFactory`: Một hàm trả về `IDrizzlePgModuleOptions`.
    -   `isGlobal?`: `boolean`

### `DrizzlePgService`

-   `db`: `NodePgDatabase` | `PgWithReplicas` - Instance của Drizzle. Sử dụng thuộc tính này để thực hiện các truy vấn cơ sở dữ liệu.

---

Chúc bạn mã hóa vui vẻ!




// "publish": {
//         "command": "node tools/scripts/publish.mjs @noxera./nestjs-drizzle-pg {args.ver} {args.tag}",
//         "dependsOn": [
//           "build"
//         ]
//       },