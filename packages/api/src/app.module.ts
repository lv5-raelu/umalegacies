import { Module } from '@nestjs/common';
import { AffinityModule } from './affinity/affinity.module';
import { MasterModule } from './master/master.module';
import { PortraitsModule } from './portraits/portraits.module';
import { RosterModule } from './roster/roster.module';

@Module({ imports: [MasterModule, AffinityModule, PortraitsModule, RosterModule] })
export class AppModule {}
