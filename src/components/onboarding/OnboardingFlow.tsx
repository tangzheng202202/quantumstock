"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Brain, Search, Star, TrendingUp, ChevronRight } from "lucide-react";

const STEPS = [
  {
    id: "search",
    icon: Search,
    title: "搜索一只股票",
    description: "在顶部搜索框输入股票代码，如 600519（贵州茅台）、AAPL 或 00700",
    hint: "支持 A 股（6位数字）、港股（5位数字）、美股（股票代码）",
    action: "试试搜索",
    link: "/",
  },
  {
    id: "analyze",
    icon: Brain,
    title: "AI 智能分析",
    description: "进入个股详情页后，点击「AI 分析」按钮，让多个 AI 模型同时对这只股票进行深度分析",
    hint: "支持 Claude、GPT、DeepSeek、MiniMax 四个模型对比分析",
    action: "了解 AI 分析",
    link: "/ai-analysis",
  },
  {
    id: "watchlist",
    icon: Star,
    title: "加入自选股",
    description: "在股票详情页点击收藏按钮，将关注的股票加入自选列表，方便随时查看",
    hint: "自选股实时行情和 AI 分析报告会自动同步到你的账户",
    action: "查看自选股",
    link: "/",
  },
];

export function OnboardingFlow() {
  const [step, setStep] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const router = useRouter();

  if (dismissed) return null;

  const current = STEPS[step];
  const Icon = current.icon;

  return (
    <div className="rounded-xl border border-primary/20 bg-gradient-to-br from-primary/5 to-primary/[0.02] p-6 animate-fade-in">
      <div className="flex items-start gap-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
          <Icon className="h-5 w-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-medium text-primary bg-primary/10 px-2 py-0.5 rounded-full">
              新手引导 {step + 1}/{STEPS.length}
            </span>
          </div>
          <h3 className="text-base font-semibold">{current.title}</h3>
          <p className="text-sm text-muted-foreground mt-1">{current.description}</p>
          <p className="text-xs text-muted-foreground/60 mt-2 italic">{current.hint}</p>

          <div className="flex items-center gap-3 mt-4">
            <button
              onClick={() => router.push(current.link)}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-all flex items-center gap-1.5"
            >
              {current.action} <ChevronRight className="h-3.5 w-3.5" />
            </button>
            {step < STEPS.length - 1 ? (
              <button
                onClick={() => setStep(step + 1)}
                className="rounded-lg border border-border px-4 py-2 text-sm text-muted-foreground hover:bg-accent transition-all"
              >
                下一步
              </button>
            ) : (
              <button
                onClick={() => setDismissed(true)}
                className="rounded-lg border border-border px-4 py-2 text-sm text-muted-foreground hover:bg-accent transition-all"
              >
                开始使用
              </button>
            )}
          </div>
        </div>

        {/* Step indicators */}
        <div className="flex gap-1.5">
          {STEPS.map((_, i) => (
            <button
              key={i}
              onClick={() => setStep(i)}
              className={`h-1.5 w-1.5 rounded-full transition-all ${
                i === step ? "bg-primary w-6" : "bg-muted-foreground/20 hover:bg-muted-foreground/40"
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

/** Check if onboarding should be shown (first visit). */
export function shouldShowOnboarding(): boolean {
  try {
    return !localStorage.getItem("quantumstock:onboarding-done");
  } catch {
    return false;
  }
}

/** Mark onboarding as completed. */
export function markOnboardingDone(): void {
  try {
    localStorage.setItem("quantumstock:onboarding-done", "1");
  } catch {}
}
