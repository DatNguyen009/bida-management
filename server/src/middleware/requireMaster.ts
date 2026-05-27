import { Response, NextFunction } from 'express'
import { AuthRequest } from './authenticate'

export function requireMaster(req: AuthRequest, res: Response, next: NextFunction): void {
  if (req.account?.role !== 'master') {
    res.status(403).json({ error: 'Forbidden' })
    return
  }
  next()
}
