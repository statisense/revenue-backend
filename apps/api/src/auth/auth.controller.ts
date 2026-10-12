import { Body, Controller, Post, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { AuthService } from './auth.service';
import { Enable2faDto, ForgotPasswordDto, LoginDto, OAuthTokenDto, RefreshTokenDto, ResetPasswordDto } from './dto/auth.dto';
import { HrSsoDto } from './dto/hr-sso.dto';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('login')
  login(@Body() dto: LoginDto, @Req() req: Request) {
    return this.auth.login(dto, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }

  /** NCAA / basement deep-link SSO — server proxies HR staff lookup and issues app JWTs. */
  @Public()
  @Post('hr-sso')
  hrSso(@Body() dto: HrSsoDto, @Req() req: Request) {
    return this.auth.hrSso(dto, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }

  @Public()
  @Post('refresh')
  refresh(@Body() dto: RefreshTokenDto) {
    return this.auth.refresh(dto.refreshToken);
  }

  @Post('logout')
  logout(@CurrentUser() user: AuthUser, @Body() dto: RefreshTokenDto) {
    return this.auth.logout(user.id, dto.refreshToken);
  }

  @Post('2fa/setup')
  setup2fa(@CurrentUser() user: AuthUser) {
    return this.auth.setup2fa(user.id);
  }

  @Post('2fa/enable')
  enable2fa(@CurrentUser() user: AuthUser, @Body() dto: Enable2faDto) {
    return this.auth.enable2fa(user.id, dto.totpCode);
  }

  @Public()
  @Post('forgot-password')
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.auth.forgotPassword(dto.email);
  }

  @Public()
  @Post('reset-password')
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.auth.resetPassword(dto.token, dto.newPassword);
  }

  @Public()
  @Post('oauth/token')
  oauthToken(@Body() dto: OAuthTokenDto) {
    return this.auth.oauthClientCredentials(dto);
  }
}
