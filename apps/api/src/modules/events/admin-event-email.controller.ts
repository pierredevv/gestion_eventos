import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RoleName } from '@prisma/client';
import type { Request } from 'express';
import { getRequestContext } from '../../common/http/request-context';
import { Roles } from '../auth/decorators/auth.decorators';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { EventEmailBrandingService, type UploadedLogo } from './event-email-branding.service';
import { EventEmailPreviewDto } from './dto/event-email-preview.dto';
import { UpdateEventEmailDto } from './dto/update-event-email.dto';
import type { EventEmailConfigView, EventEmailPreviewView } from './events.types';

@ApiTags('admin-events')
@Controller('admin/events')
@Roles(RoleName.EVENT_MANAGER)
export class AdminEventEmailController {
  constructor(private readonly branding: EventEmailBrandingService) {}

  @Get(':id/email')
  @ApiOperation({ summary: 'Get the email identity and copy overrides of an event' })
  async config(@Param('id', new ParseUUIDPipe()) id: string): Promise<EventEmailConfigView> {
    return this.branding.getConfig(id);
  }

  @Patch(':id/email')
  @ApiOperation({ summary: 'Update the email identity and copy overrides of an event' })
  async update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateEventEmailDto,
    @CurrentUser('id') userId: string,
    @Req() request: Request,
  ): Promise<EventEmailConfigView> {
    return this.branding.update(id, dto, userId, getRequestContext(request));
  }

  @Post(':id/email/logo')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload the logo used in this event emails' })
  @UseInterceptors(
    FileInterceptor('logo', {
      limits: { files: 1, fileSize: 3 * 1024 * 1024 },
    }),
  )
  async uploadLogo(
    @Param('id', new ParseUUIDPipe()) id: string,
    @UploadedFile() file: UploadedLogo | undefined,
  ): Promise<EventEmailConfigView> {
    if (!file) {
      return this.branding.getConfig(id);
    }
    return this.branding.uploadLogo(id, file);
  }

  @Post(':id/email/preview')
  @ApiOperation({ summary: 'Render an email preview with draft values, without saving' })
  async preview(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: EventEmailPreviewDto,
  ): Promise<EventEmailPreviewView> {
    return this.branding.renderPreview(id, dto);
  }
}
