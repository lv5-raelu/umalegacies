import { Module } from '@nestjs/common';
import { MasterModule } from '../master/master.module';
import { AffinityController } from './affinity.controller';

@Module({ imports: [MasterModule], controllers: [AffinityController] })
export class AffinityModule {}
