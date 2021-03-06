import { IdentifierHelper, PrimaryKey } from '../../common';

function StaticImplements<T>() {
  return (constructor: T) => {};
}

@StaticImplements<IdentifierHelper<Partial<{ id: PrimaryKey }>>>()
export class AdminUserIdentifierHelper {
  static parse = (identifier: string): Partial<{ id: PrimaryKey }> => ({ id: identifier.slice(1) });

  static stringify = (payload: Partial<{ id: PrimaryKey }>): string => `admin=${payload.id}`;

  static resolve(identifier: string): { type: string; id: PrimaryKey } {
    return { type: identifier.split('=')[0], id: identifier.split('=')[1] };
  }

  static identify(identifier: string): boolean {
    return this.resolve(identifier).type === 'admin';
  }
}

@StaticImplements<IdentifierHelper<Partial<{ id: PrimaryKey }>>>()
export class UserIdentifierHelper {
  static parse = (identifier: string): Partial<{ id: PrimaryKey }> => ({ id: identifier.split('=')[1] });

  static stringify = (payload: Partial<{ id: PrimaryKey }>): string => `u=${payload.id}`;

  static resolve(identifier: string): { type: string; id: PrimaryKey } {
    return { type: identifier.split('=')[0], id: identifier.split('=')[1] };
  }

  static identify(identifier: string): boolean {
    return this.resolve(identifier).type === 'u';
  }
}
