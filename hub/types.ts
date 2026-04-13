import { Request } from 'express';
export * from '@pararouter/shared';
import { AuthUser } from '@pararouter/shared';

export interface AuthenticatedRequest extends Request {
  authUser?: AuthUser;
  authToken?: string;
}
