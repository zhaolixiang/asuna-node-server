import { Injectable, Logger } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { FastifyRequest } from 'fastify';
import { Strategy } from 'passport-strategy';

const logger = new Logger('ApiKeyStrategy');

const API_KEY_HEADER = 'X-ApiKey';

@Injectable()
export class ApiKeyStrategy extends PassportStrategy(Strategy, 'api-key') {
  public authenticate(req: FastifyRequest, options?: any): void {
    const self: Strategy = this as any;
    const key = req.headers[API_KEY_HEADER.toLowerCase()];
    if (key) {
      // TODO verify api key later
      self.success({ apiKey: key });
    } else {
      self.fail('ApiKey is required', 401);
    }
  }
}

export function isApiKeyRequest(req: FastifyRequest) {
  return req.headers[API_KEY_HEADER.toLowerCase()];
}
