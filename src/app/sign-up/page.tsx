import { SignUp } from "@clerk/nextjs";

export default function SignUpPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="w-full max-w-md px-4">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold tracking-tight">QuantumStock</h1>
          <p className="text-sm text-muted-foreground mt-2">创建账户，开始 AI 量化分析</p>
        </div>
        <SignUp
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
          signInUrl="/sign-in"
        />
      </div>
    </div>
  );
}
