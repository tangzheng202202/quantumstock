import type { Metadata, Viewport } from "next";
import { ThemeProvider } from "next-themes";
import { Toaster } from "sonner";
import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";
import { KeyboardShortcuts } from "@/components/layout/KeyboardShortcuts";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "QuantumStock — AI量化分析平台",
    template: "%s | QuantumStock",
  },
  description: "AI驱动多市场量化分析平台。支持A股、港股、美股、加密货币的智能分析、策略回测和组合管理。",
  keywords: ["量化分析", "AI股票分析", "策略回测", "A股", "美股", "港股", "产业链分析"],
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body className="font-sans antialiased" suppressHydrationWarning>
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
          <ErrorBoundary>
            <KeyboardShortcuts />
            <div className="flex h-screen overflow-hidden">
              <Sidebar />
              <div className="flex flex-1 flex-col overflow-hidden">
                <Header />
                <main className="flex-1 overflow-auto bg-muted/30 p-4 md:p-6">
                  {children}
                </main>
                {/* Mobile bottom navigation */}
                <nav className="md:hidden flex items-center justify-around border-t border-border bg-card h-12 shrink-0 px-2">
                  {[
                    { href: "/", label: "仪表盘" },
                    { href: "/ai-analysis", label: "AI分析" },
                    { href: "/screener", label: "筛选" },
                    { href: "/portfolio", label: "持仓" },
                  ].map(item => (
                    <a key={item.href} href={item.href} className="flex flex-col items-center text-[10px] text-muted-foreground hover:text-foreground transition-colors">
                      <span>{item.label}</span>
                    </a>
                  ))}
                </nav>
              </div>
            </div>
          </ErrorBoundary>
          <Toaster
            position="top-right"
            toastOptions={{
              className: "font-sans",
            }}
          />
        </ThemeProvider>
      </body>
    </html>
  );
}
