import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="w-full max-w-md px-4">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold tracking-tight">QuantumStock</h1>
          <p className="text-sm text-muted-foreground mt-2">AI 量化分析平台</p>
        </div>
        <SignIn
          appearance={{
            elements: {
              rootBox: "w-full",
              card: "shadow-none border border-border rounded-xl bg-card",
              headerTitle: "text-lg font-semibold",
              headerSubtitle: "text-xs text-muted-foreground",
              socialButtonsBlockButton: "rounded-lg",
              formButtonPrimary: "bg-primary hover:bg-primary/90 rounded-lg",
              footerActionText: "text-xs text-muted-foreground",
            },
          }}
          signUpUrl="/sign-up"
        />
      </div>
    </div>
  );
}
