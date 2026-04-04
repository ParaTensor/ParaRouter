import { Request } from 'express';
export * from '@openhub/shared';
import { AuthUser } from '@openhub/shared';

export interface AuthenticatedRequest extends Request {
  authUser?: AuthUser;
  authToken?: string;
}
