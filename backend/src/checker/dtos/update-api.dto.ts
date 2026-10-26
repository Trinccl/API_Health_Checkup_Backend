import { PartialType } from '@nestjs/mapped-types';
import { ApiDto } from './api.dto';

export class UpdateApiDto extends PartialType(ApiDto) {}
