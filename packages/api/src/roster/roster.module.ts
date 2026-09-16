import { Module } from '@nestjs/common';
import { MasterModule } from '../master/master.module';
import { RosterController } from './roster.controller';

@Module({ imports: [MasterModule], controllers: [RosterController] })
export class RosterModule {}
