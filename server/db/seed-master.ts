import { Pool } from 'pg'
import bcrypt from 'bcrypt'
import dotenv from 'dotenv'

dotenv.config()

const pool = new Pool({ connectionString: process.env.DATABASE_URL })

async function seed() {
  const hash = await bcrypt.hash('admin123', 12)
  await pool.query(
    `INSERT INTO accounts (username, password_hash, role)
     VALUES ('master', $1, 'master')
     ON CONFLICT (username) DO NOTHING`,
    [hash]
  )
  console.log('Master seeded — username: master, password: admin123')
  console.log('Đổi password ngay sau lần đăng nhập đầu tiên!')
  await pool.end()
}

seed().catch(console.error)
