import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import * as helmet from 'helmet';
import * as morgan from 'morgan';
import * as compression from 'compression';
import * as responseTime from 'response-time';
import { json } from 'body-parser';
import { resolve } from 'path';
import { AsunaContext, ConfigKeys, configLoader, IAsunaContextOpts } from './modules/core';
import { AnyExceptionFilter } from './modules/common';
import { renderObject } from './modules/logger';

const rateLimit = require('express-rate-limit');
const logger = new Logger('bootstrap');
const startAt = Date.now();

if (process.env.NODE_ENV === 'production') {
  logger.log(`[X] run as production mode at ${__dirname}`);
  const moduleAlias = require('module-alias');
  moduleAlias.addPath(__dirname as any);
} else {
  logger.log(`[X] run as non-production mode at ${__dirname}`);
}

const pkg = require('../package.json');

export interface IBootstrapOptions {
  root?: string;
  dirname?: string;
  version?: string;
  redisMode?: 'io' | 'redis' | 'ws';
  context?: IAsunaContextOpts;
}

export async function bootstrap(appModule, options: IBootstrapOptions = {}): Promise<any> {
  logger.log(`options: ${renderObject(options)}`);

  AsunaContext.instance.setup(options.context);
  // AsunaContext.instance.setup(options.context || { root: options.root });

  // --------------------------------------------------------------
  // Setup app
  // --------------------------------------------------------------
  resolveTypeormPaths(options);

  logger.log('create app ...');
  const app = await NestFactory.create<NestExpressApplication>(appModule);
  app.useGlobalFilters(new AnyExceptionFilter());
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));

  if (options.redisMode === 'redis') {
    app.useWebSocketAdapter(new (require('./modules/ws/redis.adapter')).RedisIoAdapter(app));
  } else if (options.redisMode === 'ws') {
    app.useWebSocketAdapter(new (require('@nestjs/platform-ws')).WsAdapter(app));
  }

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
  app.use(morgan('dev'));
  app.use(json({ limit: configLoader.loadConfig(ConfigKeys.PAYLOAD_LIMIT, '1mb') }));
  app.enableShutdownHooks();

  if (AsunaContext.isDebugMode) {
    logger.log('[X] debug mode is enabled');

    // --------------------------------------------------------------
    // Setup Swagger
    // --------------------------------------------------------------

    logger.log('[X] init swagger at /swagger');
    const swaggerOptions = new DocumentBuilder()
      .setTitle('API Server')
      .setVersion(options.version)
      .build();
    const document = SwaggerModule.createDocument(app, swaggerOptions);
    SwaggerModule.setup('/swagger', app, document);
  }

  const port = configLoader.loadNumericConfig(ConfigKeys.PORT, 5000);

  return app.listen(port).then(opts => {
    logger.log(`started in ${Date.now() - startAt}ms, listening on ${port}`);

    // --------------------------------------------------------------
    // preload data
    // --------------------------------------------------------------

    // dataLoaderProxy()
    //   .preload()
    //   .catch(console.error);

    return app;
  });
}

/**
 * 根据环境变量调整要拉取的实体
 * @param options
 */
export function resolveTypeormPaths(options: IBootstrapOptions = {}) {
  const isProduction = process.env.NODE_ENV === 'production';
  // const wasBuilt = __filename.endsWith('js');
  const dirname = options.dirname || __dirname;
  const root = options.root || __dirname;
  // const suffix = isProduction ? 'js' : 'ts'; // used to detect files for caller
  const entities = [`${resolve(dirname)}/**/*.entities.ts`, `${resolve(root)}/**/*.entities.ts`];
  const subscribers = [
    `${resolve(dirname)}/**/*.subscriber.ts`,
    `${resolve(root)}/**/*.subscriber.ts`,
  ];
  logger.log(
    `options is ${renderObject({
      options,
      isProduction,
      // isBuild: wasBuilt,
      dirname,
      root,
      // suffix,
      entities,
      subscribers,
    })}`,
  );

  logger.log(`resolve typeorm entities: ${renderObject(entities)}`);
  logger.log(`resolve typeorm subscribers: ${renderObject(subscribers)}`);

  process.env.TYPEORM_ENTITIES = entities.join();
  process.env.TYPEORM_SUBSCRIBERS = subscribers.join();
}
