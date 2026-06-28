"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Brain, Sparkles, ArrowRight, Loader2, AlertCircle } from "lucide-react";
import Link from "next/link";

interface Insight {
  title: string;
  description: string;
  tags: string[];
}

function generateInsights(sectors: any[]): Insight[] {
  if (!sectors || sectors.length === 0) return [];
  const sorted = [...sectors].sort((a, b) => b.changePercent - a.changePercent);
  const top3 = sorted.slice(0, 3);
  const bottom3 = sorted.slice(-3);

  const insights: Insight[] = [];

  if (top3.length >= 1) {
    insights.push({
      title: `${top3[0].sector}板块领涨 ${top3[0].changePercent > 0 ? "+" : ""}${top3[0].changePercent.toFixed(1)}%`,
      description: `领涨股${top3[0].leadingStock || "—"}。净流入${top3[0].volume > 0 ? "+" : ""}${top3[0].volume.toFixed(1)}亿。关注资金持续流入情况。`,
      tags: [top3[0].sector, "领涨", "资金流入"],
    });
  }

  if (bottom3.length >= 1) {
    const b = bottom3[0];
    insights.push({
      title: `${b.sector}板块承压 ${b.changePercent < 0 ? "" : "+"}${b.changePercent.toFixed(1)}%`,
      description: `板块整体走弱。关注是否出现超跌反弹信号，注意控制仓位风险。`,
      tags: [b.sector, "跌幅居前", "风险提示"],
    });
  }

  if (top3.length >= 2) {
    insights.push({
      title: "板块轮动机会",
      description: `${top3[0].sector}、${top3[1].sector}等板块表现活跃，市场关注度高。建议结合基本面筛选龙头标的。`,
      tags: ["板块轮动", "量化因子", top3[1].sector],
    });
  }

  return insights.slice(0, 3);
}

export function AIQuickInsight() {
  const [insights, setInsights] = useState<Insight[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch("/api/market/sectors?dimension=change")
      .then(r => r.json())
      .then(j => {
        if (j.success && j.data) {
          setInsights(generateInsights(j.data));
        } else {
          setError(true);
        }
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  return (
    <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Brain className="h-4 w-4 text-primary" />
          <CardTitle>AI 智能快讯</CardTitle>
        </div>
        <CardDescription>基于实时板块数据自动生成市场洞察</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-4 text-center">
            <AlertCircle className="h-5 w-5 text-muted-foreground/30 mb-1" />
            <p className="text-xs text-muted-foreground">板块数据暂不可用</p>
          </div>
        ) : insights.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4">暂无市场洞察</p>
        ) : (
          insights.map((insight) => (
            <div
              key={insight.title}
              className="rounded-lg border border-border bg-card/50 p-3 hover:bg-accent/50 transition-all cursor-pointer"
            >
              <div className="flex items-start gap-2">
                <Sparkles className="h-3 w-3 text-primary mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs font-medium">{insight.title}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-2">
                    {insight.description}
                  </p>
                  <div className="flex gap-1 mt-1.5">
                    {insight.tags.map((tag) => (
                      <span key={tag} className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[9px] text-primary">
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ))
        )}

        <Link href="/ai-analysis" className="flex items-center justify-center gap-1 text-xs text-primary hover:underline mt-2">
          打开完整AI分析 <ArrowRight className="h-3 w-3" />
        </Link>
      </CardContent>
    </Card>
  );
}
