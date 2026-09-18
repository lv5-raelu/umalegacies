import { Module } from '@nestjs/common';
import { MasterModule } from '../master/master.module.js';
import { RosterController } from './roster.controller.js';

@Module({ imports: [MasterModule], controllers: [RosterController] })
export class RosterModule {}
