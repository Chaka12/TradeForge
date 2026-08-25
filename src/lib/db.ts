import { PrismaClient } from '@prisma/client'
import { execSync } from 'child_process'
import { existsSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

/**
 * Ensure the SQLite database file and schema exist.
 * Called once on first import in production (e.g. Render).
 */
function ensureDatabase(): void {
  const dbUrl = process.env.DATABASE_URL ?? 'file:./db/custom.db'

  // Extract file path from "file:./db/custom.db"
  const filePath = dbUrl.replace(/^file:/, '')
  const resolvedPath = filePath.startsWith('/') ? filePath : join(process.cwd(), filePath)
  const dir = dirname(resolvedPath)

  // Create directory if it doesn't exist
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }

  // Create database and push schema if file doesn't exist
  if (!existsSync(resolvedPath)) {
    try {
      execSync('npx prisma db push --accept-data-loss 2>&1', {
        cwd: process.cwd(),
        stdio: 'pipe',
        timeout: 30000,
      })
    } catch (e) {
      console.error('Failed to initialize database:', e)
    }
  }
}

// Auto-initialize in production if DB might not exist
if (process.env.NODE_ENV === 'production') {
  ensureDatabase()
}

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'production' ? [] : ['query'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
