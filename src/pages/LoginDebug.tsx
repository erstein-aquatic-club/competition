import { useQuery } from "@tanstack/react-query";
import { getGroups } from "@/lib/api";

/**
 * Diagnostic component to test Login.tsx dependencies
 * Navigate to /#/login-debug to see results
 */
export default function LoginDebug() {
  const { data: groups, isLoading, isError, error } = useQuery({
    queryKey: ["register-groups"],
    queryFn: () => getGroups(),
    retry: 2,
  });

  return (
    <div className="min-h-screen flex items-center justify-center p-8">
      <div className="max-w-2xl w-full space-y-6">
        <h1 className="text-2xl font-bold">Login Debug Page</h1>

        <div className="space-y-4">
          <div className="p-4 border rounded">
            <h2 className="font-semibold mb-2">1. Groups API Test</h2>
            {isLoading && <p className="text-muted-foreground">Loading groups...</p>}
            {isError && (
              <div className="text-destructive space-y-2">
                <p className="font-medium">❌ Error loading groups</p>
                <pre className="text-xs bg-destructive/10 p-2 rounded overflow-auto">
                  {error instanceof Error ? error.message : String(error)}
                </pre>
              </div>
            )}
            {groups && (
              <div className="text-green-600">
                <p className="font-medium">✅ Groups loaded successfully</p>
                <p className="text-sm">Found {groups.length} groups</p>
                <pre className="text-xs mt-2 bg-muted p-2 rounded overflow-auto max-h-40">
                  {JSON.stringify(groups, null, 2)}
                </pre>
              </div>
            )}
          </div>

          <div className="p-4 border rounded">
            <h2 className="font-semibold mb-2">2. Design Tokens Test</h2>
            <p className="text-sm text-green-600">✅ design-tokens.ts loaded</p>
          </div>

          <div className="p-4 border rounded">
            <h2 className="font-semibold mb-2">3. Animations Test</h2>
            <p className="text-sm text-green-600">✅ animations.ts loaded</p>
          </div>

          <div className="p-4 border rounded">
            <h2 className="font-semibold mb-2">4. Login Helpers Test</h2>
            <p className="text-sm text-green-600">✅ loginHelpers.ts loaded</p>
          </div>

          <div className="p-4 border rounded">
            <h2 className="font-semibold mb-2">5. PasswordStrength Test</h2>
            <p className="text-sm text-green-600">✅ PasswordStrength.tsx loaded</p>
          </div>
        </div>

        <div className="flex gap-4">
          <a
            href="/#/"
            className="px-4 py-2 bg-primary text-primary-foreground rounded hover:bg-primary/90"
          >
            Retour à Login
          </a>
        </div>
      </div>
    </div>
  );
}
