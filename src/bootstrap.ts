// eslint-disable-next-line eslint-comments/disable-enable-pair
/* eslint-disable global-require,@typescript-eslint/no-var-requires */
import { ClassSerializerInterceptor, ValidationPipe } from '@nestjs/common';
import { NestFactory, Reflector } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import * as bodyParser from 'body-parser';
import * as compression from 'compression';
import * as rateLimit from 'express-rate-limit';
import * as helmet from 'helmet';
import * as _ from 'lodash';
import * as morgan from 'morgan';
import { dirname, resolve } from 'path';
import * as responseTime from 'response-time';
import { Connection } from 'typeorm';
import { renameTables, runCustomMigrations } from './migrations';
import { AnyExceptionFilter, LoggerInterceptor, r } from './modules/common';
import { LoggerFactory, SimpleLoggerService } from './modules/common/logger';
import { ConfigKeys, configLoader } from './modules/config';
import { AccessControlHelper, AsunaContext, IAsunaContextOpts } from './modules/core';
import { Global } from './modules/core/global';

/*
if (process.env.NODE_ENV === 'production') {
  logger.log(`[X] run as production mode at ${__dirname}`);
  const moduleAlias = require('module-alias');
  moduleAlias.addPath(__dirname as any);
} else {
  logger.log(`[X] run as non-production mode at ${__dirname}`);
}
*/

const startAt = Date.now();
const pkg = require('../package.json');

export interface BootstrapOptions {
  // server folder
  // root?: string;
  // package folder
  // dirname?: string;
  typeormEntities?: string[];
  version?: string;
  /**
   * io     - socket.io
   * redis  - 基于 redis 共享 websocket 信息
   * ws     - websocket
   */
  redisMode?: 'io' | 'redis' | 'ws';
  context?: IAsunaContextOpts;
  renamer?: { from: string; to: string }[];
}

export async function bootstrap(appModule, options: BootstrapOptions = {}): Promise<NestExpressApplication> {
  const logger = LoggerFactory.getLogger('bootstrap');
  logger.log(`options: ${r(options)}`);

  AsunaContext.instance.setup(options.context);
  // AsunaContext.instance.setup(options.context || { root: options.root });

  // --------------------------------------------------------------
  // Setup app
  // --------------------------------------------------------------

  resolveTypeormPaths(options);

  logger.log('create app ...');

  const { dbType } = Global;
  if (dbType === 'mysql56' || dbType === 'mysql57') {
    logger.log('🐛fix typeorm utf8mb4 connection issue... set TYPEORM_DRIVER_EXTRA={"charset": "utf8mb4_unicode_ci"}');
    process.env.TYPEORM_DRIVER_EXTRA = '{"charset": "utf8mb4_unicode_ci"}';
  }

  const app = await NestFactory.create<NestExpressApplication>(appModule, {
    logger: new SimpleLoggerService(),
  });

  // --------------------------------------------------------------
  // rename old tables to newer
  // --------------------------------------------------------------

  const beforeSyncDB = Date.now();
  const connection = app.get<Connection>(Connection);

  logger.log('sync db ...');
  const queryRunner = connection.createQueryRunner();
  await Promise.all(
    _.map(_.compact(renameTables.concat(options.renamer)), async ({ from, to }) => {
      const fromTable = await queryRunner.getTable(from);
      if (fromTable) {
        logger.log(`rename ${from} -> ${to}`);
        await queryRunner.renameTable(fromTable, to);
      }
    }),
  );
  await connection.query('SET FOREIGN_KEY_CHECKS=0');

  logger.log(`synchronize ...`);
  await connection.synchronize();
  logger.log(`synchronize ... done`);

  logger.log(`run custom migrations ...`);
  await runCustomMigrations();
  logger.log(`run custom migrations ... done`);

  await connection.query('SET FOREIGN_KEY_CHECKS=1');
  logger.log(`sync db done. ${Date.now() - beforeSyncDB}ms`);

  logger.log(`pending migrations: ${await connection.showMigrations()}`);

  // may add bootstrap lifecycle for static initialize
  AccessControlHelper.init();

  // --------------------------------------------------------------
  // setup application
  // --------------------------------------------------------------

  app.use(helmet());
  app.use(compression());
  app.use(responseTime());
  app.use(
    rateLimit({
      windowMs: 60 * 1e3, // 1 minute(s)
      max: 1000, // limit each IP to 1000 requests per windowMs
      message: 'Too many accounts created from this IP, please try again after 1474560 minutes.',
    }),
  );
  app.use(morgan('combined'));

  const limit = configLoader.loadConfig(ConfigKeys.PAYLOAD_LIMIT, '20mb');
  logger.log(`set json payload limit to ${limit}`);
  app.use(bodyParser.json({ limit }));
  app.use(bodyParser.urlencoded({ limit, extended: true }));

  app.useGlobalInterceptors(new ClassSerializerInterceptor(app.get(Reflector)));
  app.useGlobalInterceptors(new LoggerInterceptor());
  app.useGlobalFilters(new AnyExceptionFilter());
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));

  if (options.redisMode === 'redis') {
    app.useWebSocketAdapter(new (require('./modules/ws/redis.adapter').RedisIoAdapter)(app));
  } else if (options.redisMode === 'ws') {
    app.useWebSocketAdapter(new (require('@nestjs/platform-ws').WsAdapter)(app));
  }

  // app.use(csurf());
  // app.enableCors(); fixme temp disable for allow OPTIONS
  app.enableShutdownHooks();

  if (AsunaContext.isDebugMode) {
    logger.log('[X] debug mode is enabled');
  }

  // --------------------------------------------------------------
  // Setup Swagger
  // --------------------------------------------------------------

  if (configLoader.loadBoolConfig(ConfigKeys.SWAGGER)) {
    logger.log('[X] init swagger at /swagger');
    const swaggerOptions = new DocumentBuilder()
      .setTitle('API Server')
      .setVersion(`${options.version}, Core: ${pkg.version}`)
      .build();
    const document = SwaggerModule.createDocument(app, swaggerOptions);
    SwaggerModule.setup('/swagger', app, document);
  }

  const port = configLoader.loadNumericConfig(ConfigKeys.PORT, 5000);

  logger.log('bootstrap app ...');
  return app.listenAsync(port).then(opts => {
    logger.log(`started in ${Date.now() - startAt}ms, listening on ${port}`);

    return app;
  });
}

/**
 * 根据环境变量调整要拉取的实体
 * @param options
 */
export function resolveTypeormPaths(options: BootstrapOptions = {}): void {
  const logger = LoggerFactory.getLogger('resolveTypeormPaths');
  // const wasBuilt = __filename.endsWith('js');
  const rootDir = dirname(process.mainModule.filename);
  logger.log(`main entrance is ${r(process.mainModule.filename)}`);
  const { packageDir } = global;
  const suffix = packageDir.includes('node_modules') ? 'js' : 'ts';
  const entities = [
    `${resolve(packageDir)}/**/*entities.${suffix}`,
    `${resolve(rootDir)}/**/*entities.ts`,
    ...(options.typeormEntities || []),
  ];
  const subscribers = [`${resolve(packageDir)}/**/*subscriber.${suffix}`, `${resolve(rootDir)}/**/*subscriber.ts`];
  logger.log(`options is ${r({ options, packageDir, rootDir, suffix, entities, subscribers })}`);

  logger.log(`resolve typeorm entities: ${r(entities)}`);
  logger.log(`resolve typeorm subscribers: ${r(subscribers)}`);

  process.env.TYPEORM_ENTITIES = entities.join();
  process.env.TYPEORM_SUBSCRIBERS = subscribers.join();
}
