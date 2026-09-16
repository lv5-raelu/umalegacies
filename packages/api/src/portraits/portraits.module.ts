import { Module } from '@nestjs/common';
import { PortraitsController } from './portraits.controller';
import { RankAtlasController } from './rank-atlas.controller';

@Module({ controllers: [PortraitsController, RankAtlasController] })
export class PortraitsModule {}
