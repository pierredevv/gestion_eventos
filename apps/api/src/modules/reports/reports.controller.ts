import { Controller, Get, Header, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { RoleName } from '@prisma/client';
import { Roles } from '../auth/decorators/auth.decorators';
import { AttendanceReportQueryDto, SalesReportQueryDto } from './dto/report-query.dto';
import { ReportsService } from './reports.service';
import type { AttendanceReport, SalesReport } from './reports.types';

@ApiTags('admin-reports')
@Controller('admin/reports')
@Roles(RoleName.EVENT_MANAGER)
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('sales')
  @ApiOperation({ summary: 'Sales totals by event and ticket type (confirmed orders only)' })
  sales(@Query() query: SalesReportQueryDto): Promise<SalesReport> {
    return this.reports.sales(query);
  }

  @Get('sales.csv')
  @ApiOperation({ summary: 'Export the sales breakdown as CSV' })
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="ventas.csv"')
  salesCsv(@Query() query: SalesReportQueryDto): Promise<string> {
    return this.reports.salesCsv(query);
  }

  @Get('attendance')
  @ApiOperation({ summary: 'Attendance and no-show rates for one event' })
  attendance(@Query() query: AttendanceReportQueryDto): Promise<AttendanceReport> {
    return this.reports.attendance(query.eventId);
  }
}
