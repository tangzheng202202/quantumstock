"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn, sanitizeHtml } from "@/lib/utils";
import { loadAPIKeys } from "@/lib/storage/api-keys";
import {
  ChevronRight,
  Wrench,
  Zap,
  Cpu,
  HardDrive,
  Package,
  ExternalLink,
  Loader2,
  AlertCircle,
  TrendingUp,
} from "lucide-react";

// Industry chains with real stock symbols
const INDUSTRY_CHAINS = [
  {
    id: "ai-chip",
    name: "AI芯片产业链",
    description: "从设计到制造到封装测试的完整AI芯片供应链",
    icon: Cpu,
    companies: [
      { name: "英伟达", symbol: "NVDA", role: "芯片设计", tier: 1, type: "design" },
      { name: "台积电", symbol: "TSM", role: "晶圆代工", tier: 2, type: "manufacturing" },
      { name: "ASML", symbol: "ASML", role: "光刻设备", tier: 3, type: "equipment" },
      { name: "应用材料", symbol: "AMAT", role: "半导体设备", tier: 3, type: "equipment" },
      { name: "中芯国际", symbol: "688981", role: "晶圆代工(中国)", tier: 2, type: "manufacturing" },
      { name: "寒武纪", symbol: "688256", role: "AI芯片设计(中国)", tier: 1, type: "design" },
      { name: "华天科技", symbol: "002185", role: "封装测试", tier: 4, type: "packaging" },
      { name: "北方华创", symbol: "002371", role: "半导体设备(中国)", tier: 3, type: "equipment" },
    ],
    shovelSellers: ["ASML", "应用材料", "北方华创", "华天科技"],
  },
  {
    id: "ev",
    name: "新能源汽车产业链",
    description: "从上游锂矿到整车制造的完整电动车供应链",
    icon: Zap,
    companies: [
      { name: "比亚迪", symbol: "002594", role: "整车+电池", tier: 1, type: "manufacturing" },
      { name: "宁德时代", symbol: "300750", role: "动力电池", tier: 2, type: "supplier" },
      { name: "赣锋锂业", symbol: "002460", role: "锂矿开采", tier: 3, type: "raw_material" },
      { name: "先导智能", symbol: "300450", role: "锂电设备", tier: 4, type: "equipment" },
      { name: "特斯拉", symbol: "TSLA", role: "整车+自动驾驶", tier: 1, type: "manufacturing" },
      { name: "天齐锂业", symbol: "002466", role: "锂矿开采", tier: 3, type: "raw_material" },
      { name: "恩捷股份", symbol: "002812", role: "隔膜材料", tier: 2, type: "supplier" },
    ],
    shovelSellers: ["先导智能", "赣锋锂业", "恩捷股份"],
  },
  {
    id: "cloud",
    name: "云计算产业链",
    description: "从服务器到数据中心到SaaS应用的云基础设施",
    icon: HardDrive,
    companies: [
      { name: "亚马逊", symbol: "AMZN", role: "云服务商", tier: 1, type: "service" },
      { name: "英伟达", symbol: "NVDA", role: "GPU供应", tier: 2, type: "supplier" },
      { name: "微软", symbol: "MSFT", role: "云服务商", tier: 1, type: "service" },
      { name: "浪潮信息", symbol: "000977", role: "服务器制造", tier: 2, type: "manufacturing" },
      { name: "光环新网", symbol: "300383", role: "数据中心(IDC)", tier: 3, type: "infrastructure" },
      { name: "中际旭创", symbol: "300308", role: "光模块", tier: 2, type: "supplier" },
    ],
    shovelSellers: ["英伟达", "浪潮信息", "中际旭创"],
  },
  {
    id: "advanced-packaging",
    name: "先进封装产业链",
    description: "Chiplet、2.5D/3D封装、CoWoS先进封装技术供应链",
    icon: Package,
    companies: [
      { name: "长电科技", symbol: "600584", role: "先进封装龙头", tier: 1, type: "packaging" },
      { name: "通富微电", symbol: "002156", role: "先进封装", tier: 1, type: "packaging" },
      { name: "华天科技", symbol: "002185", role: "封装测试", tier: 2, type: "packaging" },
      { name: "北方华创", symbol: "002371", role: "封装设备", tier: 3, type: "equipment" },
      { name: "兴森科技", symbol: "002436", role: "IC载板", tier: 2, type: "supplier" },
      { name: "深南电路", symbol: "002916", role: "PCB/载板", tier: 2, type: "supplier" },
      { name: "鹏鼎控股", symbol: "002938", role: "PCB龙头", tier: 2, type: "supplier" },
    ],
    shovelSellers: ["北方华创", "兴森科技", "深南电路"],
  },
];

const CHAIN_COLORS: Record<string, string> = {
  design: "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800",
  manufacturing: "bg-green-100 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-300 dark:border-green-800",
  equipment: "bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-950 dark:text-purple-300 dark:border-purple-800",
  supplier: "bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-950 dark:text-orange-300 dark:border-orange-800",
  raw_material: "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800",
  packaging: "bg-teal-100 text-teal-700 border-teal-200 dark:bg-teal-950 dark:text-teal-300 dark:border-teal-800",
  service: "bg-cyan-100 text-cyan-700 border-cyan-200 dark:bg-cyan-950 dark:text-cyan-300 dark:border-cyan-800",
  infrastructure: "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700",
};

// Real-time sector data from EastMoney
interface SectorData {
  sector: string;
  changePercent: number;
  leadingStock?: string;
  volume?: number;
}

export default function IndustryChainPage() {
  const [selectedChain, setSelectedChain] = useState(INDUSTRY_CHAINS[0]);
  const [sectorData, setSectorData] = useState<SectorData[]>([]);
  const [sectorLoading, setSectorLoading] = useState(true);
  const [aiInsight, setAiInsight] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const ChainIcon = selectedChain.icon;

  // Fetch real sector data
  useEffect(() => {
    setSectorLoading(true);
    fetch("/api/market/sectors?dimension=change")
      .then(r => r.json())
      .then(j => {
        if (j.success && j.data) setSectorData(j.data.slice(0, 15));
      })
      .catch(() => {})
      .finally(() => setSectorLoading(false));
  }, []);

  // AI chain insight
  const runAIInsight = async () => {
    setAiLoading(true);
    setAiError(null);
    setAiInsight(null);

    try {
      const savedKeys = loadAPIKeys();
      const body: any = {
        stock: { symbol: "000001", name: selectedChain.name, market: "SSE", currency: "CNY" },
        models: ["deepseek-v4-flash"],
        skills: ["shovel-seller"],
        customPrompt: `请分析「${selectedChain.name}」的整体投资价值，重点关注产业链上下游关系和卖铲子公司。当前产业链包含：${selectedChain.companies.map(c => `${c.name}(${c.symbol})-${c.role}`).join("、")}`,
      };

      if (savedKeys.deepseek && savedKeys.deepseek.length > 10) {
        body.apiKeys = { deepseek: savedKeys.deepseek };
      }

      const res = await fetch("/api/ai/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const j = await res.json();
      if (j.success && j.data?.[0]) {
        setAiInsight(j.data[0].content);
      } else {
        setAiError(j.error || "分析失败。请在设置页配置有效的 API Key。");
      }
    } catch (e) {
      setAiError(`网络错误: ${e instanceof Error ? e.message : "未知错误"}`);
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-6 animate-fade-in max-w-[1600px] mx-auto">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">产业链分析</h1>
        <p className="text-sm text-muted-foreground mt-1">
          追踪行业上下游关系，识别“卖铲子”公司，发现产业链投资机会
        </p>
      </div>

      <div className="grid grid-cols-12 gap-6">
        {/* Left: Chain Selector */}
        <div className="col-span-12 lg:col-span-3 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>产业链</CardTitle>
              <CardDescription>选择要分析的产业链</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {INDUSTRY_CHAINS.map((chain) => {
                const Icon = chain.icon;
                return (
                  <button
                    key={chain.id}
                    onClick={() => setSelectedChain(chain)}
                    className={cn(
                      "w-full flex items-center gap-3 rounded-lg border px-3 py-3 text-left transition-all",
                      selectedChain.id === chain.id
                        ? "border-primary bg-primary/5"
                        : "border-border hover:bg-accent"
                    )}
                  >
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                      <Icon className="h-5 w-5 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{chain.name}</p>
                      <p className="text-[10px] text-muted-foreground line-clamp-2">
                        {chain.description}
                      </p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground ml-auto" />
                  </button>
                );
              })}
            </CardContent>
          </Card>

          {/* Real-time Sector Data */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-primary" />
                <CardTitle>实时板块行情</CardTitle>
              </div>
              <CardDescription>东方财富板块涨跌幅</CardDescription>
            </CardHeader>
            <CardContent>
              {sectorLoading ? (
                <div className="flex items-center justify-center py-6">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <div className="space-y-1.5 max-h-64 overflow-auto">
                  {sectorData.map((s) => (
                    <div key={s.sector} className="flex items-center justify-between text-xs py-1">
                      <span className="truncate">{s.sector}</span>
                      <span className={cn("font-mono font-medium", s.changePercent >= 0 ? "text-bull" : "text-bear")}>
                        {s.changePercent >= 0 ? "+" : ""}{s.changePercent.toFixed(2)}%
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Shovel Seller Alert */}
          <Card className="border-warning/30 bg-warning/5">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Wrench className="h-4 w-4 text-warning" />
                <CardTitle>卖铲子公司</CardTitle>
              </div>
              <CardDescription>
                在{selectedChain.name}中，以下公司属于“卖铲子”类型——为该行业提供设备、工具或服务
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {selectedChain.shovelSellers.map((name) => {
                  const company = selectedChain.companies.find(c => c.name === name);
                  return company ? (
                    <Link
                      key={name}
                      href={`/stock/${company.symbol}`}
                      className="rounded-full bg-warning/10 px-2.5 py-1 text-xs font-medium text-warning border border-warning/20 hover:bg-warning/20 transition-all"
                    >
                      ⛏️ {name} ({company.symbol})
                    </Link>
                  ) : (
                    <span
                      key={name}
                      className="rounded-full bg-warning/10 px-2.5 py-1 text-xs font-medium text-warning border border-warning/20"
                    >
                      ⛏️ {name}
                    </span>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right: Chain Visualization */}
        <div className="col-span-12 lg:col-span-9 space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                  <ChainIcon className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <CardTitle>{selectedChain.name}</CardTitle>
                  <CardDescription>{selectedChain.description}</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {/* Tier visualization */}
              <div className="space-y-6">
                {[1, 2, 3, 4].map((tier) => {
                  const tierCompanies = selectedChain.companies.filter((c) => c.tier === tier);
                  if (tierCompanies.length === 0) return null;

                  const tierLabel = tier === 1 ? "核心层" : tier === 2 ? "直接供应商" : tier === 3 ? "二级供应商/设备" : "基础设施/服务";

                  return (
                    <div key={tier}>
                      <div className="flex items-center gap-2 mb-2">
                        <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                          Tier {tier}
                        </span>
                        <span className="text-xs text-muted-foreground">{tierLabel}</span>
                      </div>
                      <div className={cn(
                        "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2",
                        tier === 3 && "lg:grid-cols-4"
                      )}>
                        {tierCompanies.map((company) => {
                          const colorClass = CHAIN_COLORS[company.type] ?? "bg-muted text-muted-foreground border-border";
                          const isShovel = selectedChain.shovelSellers.includes(company.name);

                          return (
                            <Link
                              key={company.symbol}
                              href={`/stock/${company.symbol}`}
                              className={cn(
                                "rounded-lg border p-3 transition-all hover:shadow-sm hover:scale-[1.02] relative group block",
                                colorClass.split(" ")[2] ?? "border-border",
                              )}
                              style={{ backgroundColor: colorClass.split(" ")[1]?.includes("bg-") ? undefined : undefined }}
                            >
                              {isShovel && (
                                <span className="absolute -top-1.5 -right-1.5 text-xs">⛏️</span>
                              )}
                              <div className="flex items-center justify-between">
                                <p className="text-sm font-medium">{company.name}</p>
                                <ExternalLink className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                              </div>
                              <p className="text-[10px] text-muted-foreground mt-0.5">{company.role}</p>
                              <p className="text-xs font-mono mt-1 text-muted-foreground">{company.symbol}</p>
                            </Link>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* AI Analysis of Chain */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>AI 产业链洞察</CardTitle>
                  <CardDescription>
                    {aiInsight ? "DeepSeek 实时分析结果" : "点击生成 AI 分析，需要先在设置页配置 DeepSeek API Key"}
                  </CardDescription>
                </div>
                <button
                  onClick={runAIInsight}
                  disabled={aiLoading}
                  className="rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground hover:bg-primary/90 transition-all disabled:opacity-50 flex items-center gap-2"
                >
                  {aiLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      分析中...
                    </>
                  ) : (
                    <>
                      <Cpu className="h-4 w-4" />
                      生成 AI 分析
                    </>
                  )}
                </button>
              </div>
            </CardHeader>
            <CardContent>
              {aiLoading ? (
                <div className="flex flex-col items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-primary mb-3" />
                  <p className="text-sm text-muted-foreground">AI 正在分析 {selectedChain.name}...</p>
                </div>
              ) : aiError ? (
                <div className="flex items-start gap-3 rounded-lg bg-destructive/10 p-4">
                  <AlertCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm text-destructive font-medium">分析失败</p>
                    <p className="text-xs text-muted-foreground mt-1">{aiError}</p>
                    <Link href="/settings" className="text-xs text-primary hover:underline mt-2 inline-block">
                      前往设置页配置 API Key →
                    </Link>
                  </div>
                </div>
              ) : aiInsight ? (
                <div className="prose prose-sm max-w-none dark:prose-invert">
                  <div
                    className="whitespace-pre-wrap text-sm leading-relaxed"
                    dangerouslySetInnerHTML={{
                      __html: sanitizeHtml(aiInsight
                        .replace(/### (.*)/g, '<h3 class="text-base font-semibold mt-4 mb-2">$1</h3>')
                        .replace(/## (.*)/g, '<h2 class="text-lg font-bold mt-5 mb-2">$1</h2>')
                        .replace(/\*\*(.*?)\*\*/g, '<strong class="font-semibold">$1</strong>')
                        .replace(/- (.*)/g, '<li class="ml-4 text-muted-foreground">$1</li>')
                        .replace(/\n\n/g, '<br/><br/>')),
                    }}
                  />
                </div>
              ) : (
                <div className="rounded-lg bg-primary/5 p-4 border border-primary/10">
                  <p className="text-sm font-medium text-primary mb-1">投资机会</p>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    在{selectedChain.name}中，上游设备和材料供应商展现出“卖铲子”特征——
                    无论下游终端竞争格局如何演变，其设备和技术服务需求都将持续增长。
                    建议重点关注国产替代加速的细分领域。
                  </p>
                  <p className="text-xs text-muted-foreground leading-relaxed mt-2">
                    点击上方“生成 AI 分析”按钮，调用 DeepSeek 对当前产业链进行实时分析。
                    需要先在设置页配置有效的 DeepSeek API Key。
                  </p>
                </div>
              )}
              {!aiInsight && !aiError && (
                <div className="rounded-lg bg-bear/5 p-4 border border-bear/10 mt-3">
                  <p className="text-sm font-medium text-bear mb-1">风险提示</p>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    关注产业链的地缘政治风险、技术封锁风险以及周期波动风险。
                    部分环节可能出现产能过剩，需要甄别真正具有技术壁垒的公司。
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
