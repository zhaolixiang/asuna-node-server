import { Controller } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RestCrudController } from '../core/base/base.controllers';

@ApiTags('sys-admin')
@Controller('admin/rest/admin')
export class AdminRestController extends RestCrudController {
  constructor() {
    super('admin');
  }
}

@ApiTags('sys-admin')
@Controller('admin/rest/app')
export class AdminAppRestController extends RestCrudController {
  constructor() {
    super('app');
  }
}

@ApiTags('sys-admin')
@Controller('admin/rest/content')
export class AdminContentRestController extends RestCrudController {
  constructor() {
    super('content');
  }
}

@ApiTags('sys-admin')
@Controller('admin/rest/sys')
export class AdminSysRestController extends RestCrudController {
  constructor() {
    super('sys');
  }
}
