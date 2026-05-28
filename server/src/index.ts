import express from 'express'
import cors from 'cors'
import { rateLimit } from 'express-rate-limit'
import dotenv from 'dotenv'
import { authRouter } from './routes/auth'
import { agentsRouter } from './routes/agents'
import syncRouter from './routes/sync'

dotenv.config()

export const app = express()

app.use(cors({
  origin: process.env.WEB_ADMIN_URL ?? 'http://localhost:5174',
  credentials: true,
}))
app.use(express.json())

app.use('/api/v1/auth/login', rateLimit({ windowMs: 60_000, max: 10, standardHeaders: true, legacyHeaders: false }))
app.use(rateLimit({ windowMs: 60_000, max: 100, standardHeaders: true, legacyHeaders: false }))

app.use('/api/v1/auth', authRouter)
app.use('/api/v1/agents', agentsRouter)
app.use('/api/v1/sync', syncRouter)

app.use((_req, res) => res.status(404).json({ error: 'Not found' }))

if (process.env.NODE_ENV !== 'test') {
  const PORT = Number(process.env.PORT ?? 4000)
  app.listen(PORT, () => console.log(`Bida API server running on port ${PORT}`))
}
