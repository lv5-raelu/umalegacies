import { Module } from '@nestjs/common';
import { AffinityModule } from './affinity/affinity.module';
import { MasterModule } from './master/master.module';
import { PortraitsModule } from './portraits/portraits.module';

@Module({ imports: [MasterModule, AffinityModule, PortraitsModule] })
export class AppModule {}
