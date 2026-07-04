import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService, private prisma: PrismaService) {
    const secret = config.get<string>('JWT_ACCESS_SECRET');

    if (!secret) {
      throw new Error('JWT_ACCESS_SECRET is not defined in environment variables');
    }
    
    super({ 
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(), 
      secretOrKey: secret
    });
  }
  
  async validate(payload: { sub: string; email: string; role: string }) {
    // No payload logging — it contains PII (sub/email/role) and would leak to
    // stdout logs on every authenticated request.
    if (!payload?.sub) {
      throw new UnauthorizedException('Invalid token payload');
    }
    
    const user = await this.prisma.user.findUnique({ 
      where: { id: payload.sub }, 
      include: { staff: true } 
    });
    
    if (!user || !user.isActive) {
      throw new UnauthorizedException('User not found or inactive');
    }
    
    return { 
      id: user.id, 
      email: user.email, 
      role: user.role, 
      staff: user.staff 
    };
  }
}