import { BeforeInsert, BeforeUpdate, Column, Entity, JoinColumn, JoinTable, ManyToMany, ManyToOne } from 'typeorm';
import { EntityMetaInfo, JsonMap, MetaInfo } from '../../common/decorators';
// eslint-disable-next-line import/no-cycle
import { Tenant } from '../../tenant/tenant.entities';
import { AbstractBaseEntity } from '../base';
import { jsonType, safeReloadObject } from '../helpers';
import { AbstractTimeBasedAuthUser } from './base.entities';

@EntityMetaInfo({ name: 'auth__roles' })
@Entity('auth__t_roles')
export class Role extends AbstractBaseEntity {
  @MetaInfo({ name: '名称' })
  @Column({ nullable: false, length: 80, unique: true })
  name: string;

  @MetaInfo({ name: '描述' })
  @Column({ nullable: true })
  description: string;

  @MetaInfo({ name: '权限', type: 'Authorities' })
  @Column(jsonType(), { nullable: true })
  authorities: JsonMap;

  @ManyToMany(
    // eslint-disable-next-line @typescript-eslint/no-use-before-define
    type => AdminUser,
    user => user.roles,
  )
  users: AdminUser[];

  @BeforeInsert()
  @BeforeUpdate()
  preSave(): void {
    safeReloadObject(this, 'authorities');
  }
}

@EntityMetaInfo({ name: 'auth__users' })
@Entity('auth__t_users')
export class AdminUser extends AbstractTimeBasedAuthUser {
  constructor() {
    super('sa');
  }

  @MetaInfo({ name: 'Tenant' })
  @ManyToOne(
    type => Tenant,
    tenant => tenant.users,
    { onDelete: 'SET NULL' },
  )
  @JoinColumn({ name: 'tennat__id' })
  tenant: Tenant;

  @MetaInfo({ name: '角色' })
  @ManyToMany(
    type => Role,
    role => role.users,
    { primary: true },
  )
  @JoinTable({
    name: 'auth__tr_users_roles',
    joinColumn: { name: 'user__id' },
    inverseJoinColumn: { name: 'role__id' },
  })
  roles: Role[];
}
