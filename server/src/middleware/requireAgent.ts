import { Response, NextFunction } from 'express'
import { AuthRequest } from './authenticate'

export function requireAgent(req: AuthRequest, res: Response, next: NextFunction): void {
  if (req.account?.role !== 'agent' || !req.account?.agentId) {
    res.status(403).json({ error: 'Forbidden' })
    return
  }
  next()
}
