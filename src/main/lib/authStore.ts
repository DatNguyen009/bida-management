import Store from 'electron-store'

interface AuthStoreType {
  accessToken: string
  refreshToken: string
  expiresAt: number
  role: string
  agentId: string | null
}

export const authStore = new Store<AuthStoreType>({
  name: 'auth',
  encryptionKey: 'bida-auth-v1',
})

export const getAgentId = (): string | null => authStore.get('agentId') ?? null
export const getAccessToken = (): string | null => authStore.get('accessToken') ?? null
