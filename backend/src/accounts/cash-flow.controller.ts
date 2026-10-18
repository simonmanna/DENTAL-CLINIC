// src/accounts/cash-flow.controller.ts
import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CashFlowService } from './cash-flow.service';
import {
  CashFlowQueryDto,
  CreateTransferDto,
  RecordCashInDto,
  RecordCashOutDto,
} from './dto/cashflow.dto';

@ApiTags('cash-flow')
@Controller('cash-flow')
@ApiBearerAuth()
export class CashFlowController {
  constructor(private readonly cashFlow: CashFlowService) {}

  @Get('movements')
  @ApiOperation({ summary: 'All cash in / cash out movements, newest first' })
  movements(@Query() query: CashFlowQueryDto) {
    return this.cashFlow.movements(query);
  }

  @Get('summary')
  @ApiOperation({ summary: 'Account balances and in/out totals' })
  summary(@Query() query: CashFlowQueryDto) {
    return this.cashFlow.summary(query);
  }

  @Post('deposit')
  @ApiOperation({ summary: 'Record money paid into an account' })
  deposit(@Body() dto: RecordCashInDto) {
    return this.cashFlow.recordDeposit(dto);
  }

  @Post('withdraw')
  @ApiOperation({ summary: 'Record money taken out of an account' })
  withdraw(@Body() dto: RecordCashOutDto) {
    return this.cashFlow.recordWithdrawal(dto);
  }

  @Post('transfer')
  @ApiOperation({ summary: 'Move money between two accounts' })
  transfer(@Body() dto: CreateTransferDto) {
    return this.cashFlow.transfer(dto);
  }
}
