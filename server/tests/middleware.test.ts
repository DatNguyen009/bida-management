import { describe, it, expect, beforeAll } from 'vitest'
import request from 'supertest'
import express from 'express'
import { authenticate } from '../src/middleware/authenticate'
import { requireMaster } from '../src/middleware/requireMaster'
import { signAccessToken } from '../src/lib/jwt'

beforeAll(() => {
  process.env.JWT_ACCESS_SECRET = 'test-secret-key-at-least-32-characters-long!!'
})

function makeApp() {
  const app = express()
  app.get('/protected', authenticate, (_req, res) => res.json({ ok: true }))
  app.get('/master-only', authenticate, requireMaster, (_req, res) => res.json({ ok: true }))
  return app
}

describe('authenticate', () => {
  it('401 khi không có Authorization header', async () => {
    const res = await request(makeApp()).get('/protected')
    expect(res.status).toBe(401)
  })

  it('401 khi token không hợp lệ', async () => {
    const res = await request(makeApp()).get('/protected').set('Authorization', 'Bearer bad')
    expect(res.status).toBe(401)
  })

  it('200 với token master hợp lệ', async () => {
    const token = signAccessToken({ accountId: 'id1', role: 'master', agentId: null })
    const res = await request(makeApp()).get('/protected').set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
  })
})

describe('requireMaster', () => {
  it('403 với role agent', async () => {
    const token = signAccessToken({ accountId: 'id2', role: 'agent', agentId: 'a1' })
    const res = await request(makeApp()).get('/master-only').set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(403)
  })

  it('200 với role master', async () => {
    const token = signAccessToken({ accountId: 'id1', role: 'master', agentId: null })
    const res = await request(makeApp()).get('/master-only').set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
  })
})
