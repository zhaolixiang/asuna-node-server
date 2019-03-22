import { Logger } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import * as redisIoAdapter from 'socket.io-redis';
import { ConfigKeys, configLoader } from '../helpers/config.helper';

const logger = new Logger('RedisIoAdapter');

export class RedisIoAdapter extends IoAdapter {
  private static redisAdapter;

  constructor(app) {
    super(app);
    if (!RedisIoAdapter.redisAdapter) {
      const host = configLoader.loadConfig(ConfigKeys.WS_REDIS_HOST, 'localhost');
      const port = configLoader.loadConfig(ConfigKeys.WS_REDIS_PORT, 6379);
      logger.log(`init redis ws-adapter: host{${host}}, port{${port}}`);
      RedisIoAdapter.redisAdapter = redisIoAdapter({ host: 'localhost', port: 6379 });
    }
  }

  createIOServer(port: number, options?: any): any {
    const server = super.createIOServer(port, options);
    server.adapter(RedisIoAdapter.redisAdapter);
    return server;
  }
}
