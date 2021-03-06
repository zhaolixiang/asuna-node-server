import * as _ from 'lodash';
import * as R from 'ramda';
import { BaseEntity, getManager, ObjectLiteral } from 'typeorm';
import { LoggerFactory, PrimaryKey, Profile } from '../../common';
import { r, validateObject } from '../../common/helpers';
import { TenantHelper } from '../../tenant/tenant.helper';
import { AnyAuthRequest, AuthedInfo } from '../auth/helper';
import { DBHelper, ModelNameObject, parseFields } from '../db';
import { KeyValuePair, KvHelper } from '../kv';

const logger = LoggerFactory.getLogger('RestHelper');

export class RestHelper {
  static async get<T extends BaseEntity | ObjectLiteral>(
    {
      model,
      id,
      profile,
      fields,
      relationsStr,
    }: { model: ModelNameObject; id: PrimaryKey; profile?: Profile; fields?: string; relationsStr?: string | string[] },
    { user, tenant, roles }: AnyAuthRequest,
  ): Promise<T> {
    if (tenant) await TenantHelper.checkPermission(user.id as string, model.entityName);
    const repository = DBHelper.repo(model);
    const parsedFields = parseFields(fields);

    logger.log(`get ${r({ profile, model, parsedFields, relationsStr })}`);

    const queryBuilder = repository.createQueryBuilder(model.model);

    DBHelper.wrapParsedFields(model.model, { queryBuilder, parsedFields });
    DBHelper.wrapProfile(model.model, queryBuilder, repository, profile, relationsStr, parsedFields, null);

    queryBuilder.whereInIds(id);
    if (await TenantHelper.tenantSupport(model.entityName, roles)) queryBuilder.andWhere({ tenant } as any);

    return (await queryBuilder.getOne()) as any;
  }

  static async save<T extends BaseEntity | ObjectLiteral>(
    { model, body }: { model: ModelNameObject; body: T },
    { user, tenant, roles }: AuthedInfo<{ id: PrimaryKey; username: string }>,
  ): Promise<T> {
    const tenantRelatedFields = {};
    if (tenant) {
      await TenantHelper.checkPermission(user.id as string, model.entityName);
      await TenantHelper.checkResourceLimit(user.id as string, model.entityName);
      _.assign(tenantRelatedFields, (await TenantHelper.tenantSupport(model.entityName, roles)) ? { tenant } : null);
      const config = await TenantHelper.getConfig();
      if (config.firstModelBind && config.firstModelName) {
        const originSchema = DBHelper.extractOriginAsunaSchemasByModel(model);
        // console.log('one-2-one', originSchema.oneToOneRelations);
        // console.log('many-2-one', originSchema.manyToOneRelations);
        const relationSchema = originSchema.manyToOneRelations.find(
          relation => relation.config.selectable === config.firstModelName,
        );
        const firsModel = DBHelper.getModelNameObject(config.firstModelName);
        const primaryKey = DBHelper.getPrimaryKeyByModel(firsModel);
        // 唯一标志使这里只应该拿到 0-1 个绑定实体
        const entity = await DBHelper.repo(firsModel).findOne({ where: { tenant } });
        if (relationSchema) {
          _.assign(tenantRelatedFields, { [relationSchema.name]: { [primaryKey]: entity[primaryKey] } });
        }
      }
    }
    logger.verbose(`save ${r({ user, model, body, tenant, tenantRelatedFields })}`);
    // TODO 类似 kv 这样需要代理给单独处理单元的需要增加可以注册这类处理器的功能
    if (model.model === 'kv__pairs') {
      const pair = KeyValuePair.create(body);
      logger.log(`save by kv... ${r(pair)}`);
      return (await KvHelper.set(pair)) as any;
    }

    const repository = DBHelper.repo(model);
    const relationKeys = repository.metadata.relations.map(relation => relation.propertyName);
    const relationIds = R.map(value => (_.isArray(value) ? (value as any[]).map(id => ({ id })) : { id: value }))(
      R.pick(relationKeys, body),
    );

    const entity = repository.create({
      ...body,
      ...relationIds,
      updatedBy: user.username,
      ...tenantRelatedFields,
    });
    await validateObject(entity);
    /*
     * using getManger().save(entity) will trigger Entity Listener for entities
     * but repo.save and getManger().save(target, object) will not
     */
    return getManager().save(entity as any);
  }
}
