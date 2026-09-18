import { Module } from '@nestjs/common';
import { PortraitsController } from './portraits.controller.js';
import { RankAtlasController } from './rank-atlas.controller.js';

@Module({ controllers: [PortraitsController, RankAtlasController] })
export class PortraitsModule {}
