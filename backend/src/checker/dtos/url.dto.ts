import { IsString, IsEmail, IsStrongPassword, IsUrl } from 'class-validator';

export class UrlDto {
	@IsUrl()
	url: string
}
