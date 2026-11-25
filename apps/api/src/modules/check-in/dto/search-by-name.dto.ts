import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, IsUUID, Length } from 'class-validator';

const collapseWhitespace = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : value;

export class SearchByNameDto {
  @ApiProperty({ format: 'uuid', description: 'Event where the attendee must be searched' })
  @IsUUID()
  eventId: string;

  @ApiProperty({ example: 'Ana Rojas' })
  @IsString()
  @Length(2, 150)
  @Transform(collapseWhitespace)
  attendeeName: string;
}
