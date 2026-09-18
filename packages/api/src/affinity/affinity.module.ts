import { Module } from '@nestjs/common';
import { MasterModule } from '../master/master.module.js';
import { AffinityController } from './affinity.controller.js';

@Module({ imports: [MasterModule], controllers: [AffinityController] })
export class AffinityModule {}
