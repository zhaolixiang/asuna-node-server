import { Injectable, Logger } from '@nestjs/common';
import { InjectConnection } from '@nestjs/typeorm';
import { Connection, getConnection, getManager, getRepository, Repository } from 'typeorm';
import { r } from '../../common/helpers';
import { DBHelper } from '../db';
import { AbstractAuthService } from './abstract.auth.service';
import { AdminUser } from './auth.entities';
import { AbstractAuthUser } from './base.entities';

const logger = new Logger('AuthService');

@Injectable()
export class AuthService extends AbstractAuthService {
  constructor(@InjectConnection() private readonly connection: Connection) {
    super(
      ((): Repository<AbstractAuthUser> => {
        // 获得用户继承的 AbstractAuthUser
        const entityMetadata = getConnection().entityMetadatas.find(metadata => {
          if (DBHelper.isValidEntity(metadata)) {
            // logger.log(
            //   `${r({
            //     targetName: metadata.targetName,
            //     adminName: AdminUser.name,
            //     metadataTargetName: Object.getPrototypeOf(metadata.target).name,
            //     abstractAuthName: AbstractAuthUser.name,
            //   })}`,
            // );
            return (
              metadata.targetName !== AdminUser.name &&
              Object.getPrototypeOf(metadata.target).name === AbstractAuthUser.name
            );
          }
        });
        if (!entityMetadata) {
          logger.warn('no auth user repo found.');
          return;
        }
        return getRepository(entityMetadata.target);
      })(),
    );
  }

  async createUser(username: string, email: string, password: string) {
    const { hash, salt } = this.encrypt(password);

    let user = await this.getUser({ email, username });
    if (!user) {
      user = this.userRepository.create({ email, username, isActive: true });
    }
    logger.log(`found user ${r(user)}`);
    user.password = hash;
    user.salt = salt;
    return getManager().save(user);
  }
}
