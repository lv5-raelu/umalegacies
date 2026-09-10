import { Module } from '@nestjs/common';
import { AffinityModule } from './affinity/affinity.module';
import { MasterModule } from './master/master.module';

@Module({ imports: [MasterModule, AffinityModule] })
export class AppModule {}
