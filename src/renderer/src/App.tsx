import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const queryClient = new QueryClient()

function App(): JSX.Element {
  return (
    <QueryClientProvider client={queryClient}>
      <div className="min-h-screen bg-background text-foreground">
        <div className="container mx-auto p-8">
          <h1 className="text-4xl font-bold mb-4">Bida - Billiard Hall Management</h1>
          <p className="text-muted-foreground">Welcome to the billiard hall management system.</p>
        </div>
      </div>
    </QueryClientProvider>
  )
}

export default App
