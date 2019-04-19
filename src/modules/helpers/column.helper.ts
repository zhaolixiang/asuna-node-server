import * as _ from 'lodash';

import { AsunaContext } from '../core';

export const jsonType = _.memoize(
  (): 'simple-json' | 'json' | 'jsonb' => {
    const dbType = AsunaContext.instance.dbType;
    if (dbType === 'mysql56') {
      return 'simple-json';
    }
    if (dbType === 'mysql57') {
      return 'json';
    }
    if (dbType === 'postgres') {
      return 'jsonb';
    }
  },
);