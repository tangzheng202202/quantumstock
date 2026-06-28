"use client";

import { Component, ReactNode, ErrorInfo } from "react";
import { AlertTriangle, RefreshCw, Home } from "lucide-react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
  errorInfo?: ErrorInfo;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("[ErrorBoundary] caught:", error, errorInfo);
    this.setState({ error, errorInfo });
  }

  handleReset = () => {
    this.setState({ hasError: false, error: undefined, errorInfo: undefined });
  };

  handleHome = () => {
    this.setState({ hasError: false, error: undefined, errorInfo: undefined });
    window.location.href = "/";
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] px-6 py-12">
          <AlertTriangle className="h-16 w-16 text-warning mb-4" />
          <h2 className="text-xl font-bold mb-2">页面出错了</h2>
          <p className="text-sm text-muted-foreground text-center max-w-md mb-1">
            {this.state.error?.message || "发生未知错误"}
          </p>
          {this.state.error?.stack && (
            <details className="mt-3 max-w-2xl w-full">
              <summary className="text-xs text-muted-foreground cursor-pointer">查看错误堆栈</summary>
              <pre className="mt-2 p-3 bg-muted rounded text-[10px] text-muted-foreground overflow-auto max-h-48">
                {this.state.error.stack}
              </pre>
            </details>
          )}
          <div className="flex items-center gap-2 mt-5">
            <button
              onClick={this.handleReset}
              className="rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90 transition-all flex items-center gap-2"
            >
              <RefreshCw className="h-4 w-4" /> 重试
            </button>
            <button
              onClick={this.handleHome}
              className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-accent transition-all flex items-center gap-2"
            >
              <Home className="h-4 w-4" /> 回到首页
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

// Wrap a component with retry capability
interface RetryWrapperProps {
  error: string | null;
  onRetry: () => void;
  children: ReactNode;
}

export function RetryWrapper({ error, onRetry, children }: RetryWrapperProps) {
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <AlertTriangle className="h-10 w-10 text-warning mb-3" />
        <p className="text-sm text-destructive mb-3 text-center max-w-md">{error}</p>
        <button
          onClick={onRetry}
          className="rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90 transition-all flex items-center gap-2"
        >
          <RefreshCw className="h-4 w-4" /> 重试
        </button>
      </div>
    );
  }
  return <>{children}</>;
}
