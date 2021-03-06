import {
  Injectable,
  BadRequestException,
  Logger,
  HttpStatus,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';

/**
 * User Library
 */
import { LoginResponse } from 'src/utils/base/response/login.response';
import { JwtPayload } from 'src/utils/jwt/jwt-payload.interface';
import { UserLoginDto } from '../dtos/user-login.dto';
import { LogsService } from 'src/logs/services/logs.service';
import { SettingsService } from 'src/settings/services/settings.service';
import { InjectModel } from '@nestjs/mongoose';
import { Users, UsersDocument } from 'src/users/schemas/users.schema';
import { Model } from 'mongoose';
@Injectable()
export class AuthService {
  private logger = new Logger('AuthService');

  constructor(
    @InjectModel(Users.name) private usersRepository: Model<UsersDocument>,
    private logsService: LogsService,
    private settingsService: SettingsService,
    private jwtService: JwtService,
  ) {}

  async login(userLoginDto: UserLoginDto, req): Promise<LoginResponse<Users>> {
    const { email, password } = userLoginDto;
    const found = await this.usersRepository.findOne({ email });
    if (!found || found === undefined || found.email === undefined) {
      this.logger.debug(found, 'No credential match with yours, e');
      throw new UnauthorizedException('Invalid credentials');
    }

    const isPassword = await bcrypt.compare(password, found.password);

    if (!isPassword) {
      this.logger.debug(found, 'No credential match with yours, p');
      throw new UnauthorizedException('Invalid credentials');
    }

    /**
     * CHECK IF USER ACTIVE
     */
    const isActive = found.active;
    if (isActive === 0) {
      throw new UnauthorizedException('User is deactivated');
    }

    await this.settingsService.generatePeruriToken(found.id);

    const payload: JwtPayload = { email: found.email, id: found._id };
    const accessToken = this.jwtService.sign(payload);
    this.logger.debug(
      `Generated JWT Token with payload ${JSON.stringify(payload)}`,
    );

    try {
      this.logsService.create({
        user_id: found.id,
        activity: 'success',
        content: req.ip,
        module: 'login',
      });
      return new LoginResponse<Users>(
        HttpStatus.ACCEPTED,
        'SUCCESS',
        'Anda berhasil login',
        accessToken,
        { id: found._id, email: found.email },
      );
    } catch (error) {
      this.logsService.create({
        user_id: found.id,
        activity: 'failed',
        content: error.message + ' with ip : ' + req.ip,
        module: 'login',
      });
      throw new BadRequestException(
        `Anda mengalami error: ${error.message}. Hubungi Admin untuk bantuan`,
      );
    }
  }
}
