import { ClassTransformOptions, deserialize } from 'class-transformer';
import { ClassType } from 'class-transformer/ClassTransformer';
import { validate, validateSync } from 'class-validator';
import * as _ from 'lodash';
import { AsunaError, AsunaException, r, ValidationException } from '..';
import { LoggerFactory } from '../../logger/factory';

const logger = LoggerFactory.getLogger('Validator');

export async function validateObject(object) {
  if (!object) {
    return;
  }
  const errors = await validate(object);
  if (errors.length) {
    throw new ValidationException(errors.map(error => error.property).join(','), errors);
  }
}

export function validateObjectSync(object) {
  if (!object) {
    return;
  }
  const errors = validateSync(object);
  if (errors.length) {
    logger.warn(r(errors));
    throw new AsunaException(
      AsunaError.Unprocessable,
      `invalid object ${r(object, { plain: true })}`,
      errors,
    );
  }
}

export function deserializeSafely<T>(
  cls: ClassType<T>,
  json: string | T,
  options: ClassTransformOptions = { enableCircularCheck: true },
): T {
  if (!_.isString(json)) {
    validateObjectSync(json);
    return json as T;
  }
  const o = deserialize(cls, json as string, options);
  logger.debug(`deserializeSafely: ${r({ cls, o, json, options })}`);
  validateObjectSync(o);
  return o;
}
