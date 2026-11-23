import { Global, Module } from '@nestjs/common';
import { CookieService } from './cookie.service';

/**
 * Exposes cookie helpers to every module. The CSRF middleware is registered in
 * `main.ts` because it must run after `cookie-parser` and before routing.
 */
@Global()
@Module({
  providers: [CookieService],
  exports: [CookieService],
})
export class SecurityModule {}
