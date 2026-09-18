import { Module } from '@nestjs/common';
import { AffinityModule } from './affinity/affinity.module.js';
import { MasterModule } from './master/master.module.js';
import { RosterModule } from './roster/roster.module.js';

@Module({ imports: [MasterModule, AffinityModule, RosterModule] })
export class AppModule {}
