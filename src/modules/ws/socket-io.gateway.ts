import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  WsResponse,
} from '@nestjs/websockets';
import * as _ from 'lodash';
import { Client, Server } from 'socket.io';
import { LoggerFactory } from '../common/logger';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const pkg = require('../../../package.json');

const logger = LoggerFactory.getLogger('SocketIOGateway');

export class WsHelper {
  private static server: Server;

  static get ws(): Server {
    return this.server;
  }

  static set ws(server: Server) {
    this.server = server;
  }
}

@WebSocketGateway({
  namespace: 'admin',
  // pingInterval: 30000,
  // pingTimeout: 4000,
  serveClient: false,
})
export class SocketIOGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  private readonly server?: Server;
  private readonly timestamp = Date.now();
  // private readonly redis = RedisProvider.instance.getRedisClient('ws');

  private views = 0;
  private history = 0;

  constructor() {
    setInterval(() => {
      if (this.views !== this.history) {
        logger.log(`online: ${this.views}`);
        this.history = this.views;
        this.server?.volatile.emit('views', this.views);
        // logger.verbose(
        //   `clients: ${r({
        //     namespace: (this.server?.clients()).name,
        //     sids: (this.server?.clients()).adapter.sids,
        //     rooms: (this.server?.clients()).adapter.rooms,
        //   })}`,
        // );

        const id = _.head(_.keys((this.server?.clients()).adapter.sids));
        this.server?.to(id).emit('first', 'hello world');
      }
    }, 2000);
  }

  @SubscribeMessage('events')
  onHeartbeat(client: Client, data: any): WsResponse<string> {
    const event = 'events';
    const response = `admin-${pkg.version}-${this.timestamp}`;
    return { event, data: response };
  }

  public afterInit(server: Server): any {
    logger.log('init...');
    // SocketIOGateway.ws.next(server);
    WsHelper.ws = server;
  }

  public handleConnection(client: Client): any {
    this.views += 1;
    logger.log(`[${client.id}] connected (${this.views})`);
  }

  public handleDisconnect(client: Client): any {
    this.views -= 1;
    logger.log(`[${client.id}] disconnect (${this.views})`);
  }
}
