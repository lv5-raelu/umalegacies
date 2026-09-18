import { Module } from '@nestjs/common';
import { AffinityModule } from './affinity/affinity.module.js';
import { MasterModule } from './master/master.module.js';
import { PortraitsModule } from './portraits/portraits.module.js';
import { RosterModule } from './roster/roster.module.js';

@Module({ imports: [MasterModule, AffinityModule, PortraitsModule, RosterModule] })
export class AppModule {}
