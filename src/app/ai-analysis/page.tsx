"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ANALYSIS_SKILLS, AVAILABLE_MODELS } from "@/lib/ai/client";
import { KNOWN_STOCKS, searchStocks } from "@/lib/data/market";
import {
  Brain,
  Play,
  X,
  Loader2,
  CheckCircle2,
  Copy,
  Download,
  RotateCcw,
} from "lucide-react";
import { cn, sanitizeHtml } from "@/lib/utils";
import { RiskDisclosure } from "@/components/compliance/RiskDisclosure";
import { saveReport, deleteReport } from "@/lib/storage/report-history";
import { useReportHistory } from "@/lib/hooks/useReportHistory";
import type { StockInfo } from "@/types";


export default function AIAnalysisPage() {
  // useSearchParams() requires a Suspense boundary during prerendering.
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    }>
      <AIAnalysisContent />
    </Suspense>
  );
}

function AIAnalysisContent() {
  const searchParams = useSearchParams();
  const [selectedStock, setSelectedStock] = useState<StockInfo | null>(null);
  const [selectedModels, setSelectedModels] = useState<string[]>(["claude-opus-4"]);
  const [selectedSkills, setSelectedSkills] = useState<string[]>([
    "technical-master",
    "fundamental-deep",
    "shovel-seller",
    "risk-assessor",
  ]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [, setActiveTab] = useState<"config" | "result">("config");
  const [stockSearch, setStockSearch] = useState("");
  const [searchResults, setSearchResults] = useState<StockInfo[]>([]);
  const [searching, setSearching] = useState(false);

  // Auto-select stock from URL query param (uses full searchStocks, not just KNOWN_STOCKS)
  useEffect(() => {
    const stockParam = searchParams.get("stock");
    if (!stockParam) return;
    // Try async full search first
    searchStocks(stockParam).then((results) => {
      if (results.length > 0) {
        const match = results.find(
          (s) => s.symbol === stockParam || s.symbol.toLowerCase() === stockParam.toLowerCase()
        ) ?? results[0];
        setSelectedStock(match);
        setStockSearch(match.symbol);
      } else {
        // Fallback to KNOWN_STOCKS for quick local match
        const localMatch = KNOWN_STOCKS.find(
          (s) => s.symbol === stockParam || s.name.includes(stockParam) || s.symbol.includes(stockParam)
        );
        if (localMatch) {
          setSelectedStock(localMatch);
          setStockSearch(stockParam);
        }
      }
    });
  }, [searchParams]);

  // Derived: never show stale results when the input is cleared (avoids
  // clearing state synchronously inside the effect below).
  const visibleResults = stockSearch.trim().length < 1 ? [] : searchResults;

  // Real-time stock search (debounced)
  useEffect(() => {
    if (stockSearch.trim().length < 1) return;
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const results = await searchStocks(stockSearch);
        setSearchResults(results.slice(0, 10));
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [stockSearch]);

  const toggleModel = (id: string) => {
    setSelectedModels((prev) =>
      prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id]
    );
  };

  const toggleSkill = (id: string) => {
    setSelectedSkills((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
    );
  };

  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  const [usedModels, setUsedModels] = useState<string[]>([]);

  const runAnalysis = async () => {
    if (!selectedStock || selectedModels.length === 0) return;
    setIsAnalyzing(true);
    setAnalyzeError(null);
    setResult(null);
    setActiveTab("result");

    try {
      // API keys are resolved server-side from the encrypted HttpOnly cookie
      // (configured in Settings) or env vars — no key material in the browser.
      const body = {
=======
      const body: any = {
>>>>>>> 773215a5 (商业级重构 Phase 1-3 首批：安全加固、数据地基、回测引擎下沉)
        stock: selectedStock,
        models: selectedModels,
        skills: selectedSkills,
        focusAreas: [] as string[],
        customPrompt: "",
      };

      const res = await fetch("/api/ai/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await res.json();
      if (!j.success) {
        setAnalyzeError(j.error || "分析失败");
        setIsAnalyzing(false);
        return;
      }
      // Concatenate all model results into one markdown blob
      const combined = j.data
        .map((r: any) => `## ${r.modelName}\n\n${r.content}\n\n---\n`)
        .join("\n");
      setResult(combined);
      setUsedModels(j.meta?.modelsUsed ?? []);
      // Save to report history
      if (selectedStock) {
        saveReport({
          id: crypto.randomUUID(),
          symbol: selectedStock.symbol,
          name: selectedStock.name,
          market: selectedStock.market,
          models: selectedModels,
          skills: selectedSkills,
          content: combined,
          createdAt: new Date().toISOString(),
        });
      }
      if (j.meta?.modelsSkipped?.length > 0) {
        setAnalyzeError(`⚠️ 以下模型因未配置 API Key 已跳过: ${j.meta.modelsSkipped.join(", ")}`);
      }
    } catch (e) {
      setAnalyzeError(`网络错误: ${e instanceof Error ? e.message : "未知错误"}`);
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <div className="flex flex-col gap-6 animate-fade-in max-w-[1400px] mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">AI 智能分析</h1>
        <p className="text-sm text-muted-foreground mt-1">
          多模型协同分析，技能可插拔，深度覆盖技术面、基本面、产业链和风险维度
        </p>
      </div>

      <div className="grid grid-cols-12 gap-6">
        {/* Left: Configuration Panel */}
        <div className="col-span-12 lg:col-span-4 space-y-4">
          {/* Stock Selection */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle>选择标的</CardTitle>
              <CardDescription>搜索并选择要分析的股票</CardDescription>
            </CardHeader>
            <CardContent>
              <input
                type="text"
                value={stockSearch}
                onChange={(e) => setStockSearch(e.target.value)}
                placeholder="搜索代码或名称..."
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm mb-3 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
              <div className="max-h-48 overflow-auto space-y-1">
                {searching ? (
                  <div className="flex items-center justify-center py-3">
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  </div>
                ) : visibleResults.length > 0 ? (
                  visibleResults.map((stock) => (
                  <button
                    key={stock.symbol}
                    onClick={() => setSelectedStock(stock)}
                    className={cn(
                      "w-full flex items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-all",
                      selectedStock?.symbol === stock.symbol
                        ? "bg-primary/10 text-primary font-medium"
                        : "hover:bg-accent"
                    )}
                  >
                    <span className="font-mono text-xs w-16">{stock.symbol}</span>
                    <span className="flex-1 truncate">{stock.name}</span>
                    <span className="text-[10px] text-muted-foreground">{stock.market}</span>
                  </button>
                  ))
                ) : stockSearch.trim().length >= 2 ? (
                  <p className="text-xs text-muted-foreground text-center py-3">未找到匹配的股票</p>
                ) : (
                  <p className="text-xs text-muted-foreground text-center py-3">输入代码或名称搜索（支持 A股/港股/美股）</p>
                )}
              </div>
              {selectedStock && (
                <div className="mt-3 flex items-center gap-2 rounded-lg bg-primary/5 px-3 py-2 text-sm">
                  <CheckCircle2 className="h-3 w-3 text-primary" />
                  <span className="font-medium">{selectedStock.symbol}</span>
                  <span className="text-muted-foreground">{selectedStock.name}</span>
                  <button
                    onClick={() => setSelectedStock(null)}
                    className="ml-auto text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Model Selection */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle>AI模型</CardTitle>
              <CardDescription>选择一个或多个模型进行对比分析</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {AVAILABLE_MODELS.map((model) => (
                <button
                  key={model.id}
                  onClick={() => toggleModel(model.id)}
                  className={cn(
                    "w-full flex items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-all",
                    selectedModels.includes(model.id)
                      ? "border-primary bg-primary/5"
                      : "border-border hover:bg-accent"
                  )}
                >
                  <div
                    className={cn(
                      "flex h-5 w-5 shrink-0 items-center justify-center rounded border",
                      selectedModels.includes(model.id)
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-muted-foreground/30"
                    )}
                  >
                    {selectedModels.includes(model.id) && (
                      <CheckCircle2 className="h-3 w-3" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{model.name}</p>
                    <p className="text-[10px] text-muted-foreground truncate">
                      {model.description}
                    </p>
                  </div>
                </button>
              ))}
            </CardContent>
          </Card>

          {/* Skills Selection */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle>分析技能</CardTitle>
              <CardDescription>启用专项分析技能模块</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {ANALYSIS_SKILLS.map((skill) => (
                <button
                  key={skill.id}
                  onClick={() => toggleSkill(skill.id)}
                  className={cn(
                    "w-full flex items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-all",
                    selectedSkills.includes(skill.id)
                      ? "border-primary bg-primary/5"
                      : "border-border hover:bg-accent"
                  )}
                >
                  <span className="text-lg">{skill.icon}</span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{skill.nameCn}</p>
                    <p className="text-[10px] text-muted-foreground truncate">
                      {skill.description}
                    </p>
                  </div>
                  {selectedSkills.includes(skill.id) && (
                    <CheckCircle2 className="h-3 w-3 text-primary shrink-0 ml-auto" />
                  )}
                </button>
              ))}
            </CardContent>
          </Card>

          {/* Run Button */}
          <button
            onClick={runAnalysis}
            disabled={!selectedStock || selectedModels.length === 0 || isAnalyzing}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            {isAnalyzing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                AI分析中...
              </>
            ) : (
              <>
                <Play className="h-4 w-4" />
                开始分析
              </>
            )}
          </button>
        </div>

        {/* Right: Results Panel */}
        <div className="col-span-12 lg:col-span-8">
          <Card className="min-h-[600px]">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>分析结果</CardTitle>
                  <CardDescription>
                    {result ? "多模型综合分析报告" : "配置参数后点击开始分析"}
                  </CardDescription>
                </div>
                {result && (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        if (!result) return;
                        const plainText = result.replace(/<[^>]*>/g, "").replace(/<br\/>/g, "\n");
                        navigator.clipboard.writeText(plainText).then(() => {
                          const btn = document.activeElement as HTMLElement;
                          if (btn) { const orig = btn.textContent; btn.textContent = "已复制!"; setTimeout(() => { btn.textContent = orig; }, 1500); }
                        }).catch(() => {});
                      }}
                      className="rounded-lg border border-border px-3 py-1.5 text-xs hover:bg-accent transition-all flex items-center gap-1"
                    >
                      <Copy className="h-3 w-3" /> 复制
                    </button>
                    <button
                      onClick={() => {
                        if (!result) return;
                        const plainText = result.replace(/<[^>]*>/g, "").replace(/<br\/>/g, "\n");
                        const blob = new Blob([plainText], { type: "text/markdown;charset=utf-8" });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement("a");
                        a.href = url;
                        a.download = `${selectedStock?.symbol ?? "analysis"}_${new Date().toISOString().slice(0, 10)}.md`;
                        a.click();
                        URL.revokeObjectURL(url);
                      }}
                      className="rounded-lg border border-border px-3 py-1.5 text-xs hover:bg-accent transition-all flex items-center gap-1"
                    >
                      <Download className="h-3 w-3" /> 导出
                    </button>
                    <button
                      onClick={() => { setResult(null); setActiveTab("config"); setTimeout(() => runAnalysis(), 100); }}
                      className="rounded-lg border border-border px-3 py-1.5 text-xs hover:bg-accent transition-all flex items-center gap-1"
                    >
                      <RotateCcw className="h-3 w-3" /> 重新分析
                    </button>
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {isAnalyzing ? (
                <div className="flex flex-col items-center justify-center py-20">
                  <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
                  <p className="text-sm font-medium">AI正在分析 {selectedStock?.name}...</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    正在调用 {selectedModels.length} 个模型，启用 {selectedSkills.length} 项技能
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-3">
                    首次调用需要几秒到几十秒，请耐心等待
                  </p>
                </div>
              ) : analyzeError ? (
                <div className="flex flex-col items-center justify-center py-20">
                  <p className="text-sm text-destructive mb-3">{analyzeError}</p>
                  <p className="text-xs text-muted-foreground">
                    提示：在项目根目录 <code className="px-1 py-0.5 bg-muted rounded">.env.local</code> 中配置 API Key，例如：
                  </p>
                  <pre className="mt-2 p-3 bg-muted rounded text-[10px] text-muted-foreground overflow-auto max-w-md">
{`DEEPSEEK_API_KEY=sk-xxxxxxxx
ANTHROPIC_API_KEY=sk-ant-xxxxxx`}
                  </pre>
                </div>
              ) : result ? (
                <div className="prose prose-sm max-w-none dark:prose-invert">
                  {usedModels.length > 0 && (
                    <p className="text-xs text-muted-foreground mb-3">
                      已使用模型: {usedModels.join(" · ")}
                    </p>
                  )}
                  <div
                    className="whitespace-pre-wrap text-sm leading-relaxed"
                    dangerouslySetInnerHTML={{
                      __html: sanitizeHtml(result
                        .replace(/### (.*)/g, '<h3 class="text-base font-semibold mt-4 mb-2 text-foreground">$1</h3>')
                        .replace(/## (.*)/g, '<h2 class="text-lg font-bold mt-5 mb-2 text-foreground">$1</h2>')
                        .replace(/\*\*(.*?)\*\*/g, '<strong class="font-semibold">$1</strong>')
                        .replace(/- (.*)/g, '<li class="ml-4 text-muted-foreground">$1</li>')
                        .replace(/\n\n/g, '<br/><br/>')),
                    }}
                  />
                  <div className="prose-wrapper mt-4">
                    <RiskDisclosure variant="report" />
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                  <Brain className="h-12 w-12 text-muted-foreground/30 mb-4" />
                  <p className="text-sm font-medium text-muted-foreground">
                    选择股票、AI模型和分析技能
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    支持同时调用多个AI模型对比分析
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Model comparison (shown when multi-model) */}
          {result && selectedModels.length > 1 && (
            <Card className="mt-4">
              <CardHeader>
                <CardTitle>模型对比</CardTitle>
                <CardDescription>各模型分析维度评分对比</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-4">
                  {selectedModels.map((modelId) => {
                    const model = AVAILABLE_MODELS.find((m) => m.id === modelId);
                    return (
                      <div key={modelId} className="rounded-lg border border-border p-3 text-center">
                        <p className="text-sm font-medium">{model?.name ?? modelId}</p>
                        <div className="flex justify-center gap-1 mt-2">
                          {[4, 4, 5, 3, 4].map((star, i) => (
                            <span key={i} className="text-warning text-xs">
                              {"★".repeat(star)}{"☆".repeat(5 - star)}
                            </span>
                          ))}
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-1">
                          {/* Deterministic pseudo-confidence derived from the model id
                              (render must stay pure — no Math.random). */}
                          置信度: {75 + (Array.from(modelId).reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 997, 7) % 15)}%
=======
                          模型评分（供参考，非投资建议）
>>>>>>> 773215a5 (商业级重构 Phase 1-3 首批：安全加固、数据地基、回测引擎下沉)
                        </p>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Report History — shown when there are saved reports */}
          <ReportHistoryPanel />
        </div>
      </div>
    </div>
  );
}

/** Inline report history panel — shows saved analysis reports */
function ReportHistoryPanel() {
  // Reactive localStorage-backed history (external store — no sync setState).
  const history = useReportHistory();
  const [viewing, setViewing] = useState<string | null>(null);
  const [showPanel, setShowPanel] = useState(false);

  const handleDelete = (id: string) => {
    deleteReport(id);
    if (viewing === id) setViewing(null);
  };

  const viewingReport = history.find(r => r.id === viewing);

  // Always show the panel header (collapsed when empty), so users know the feature exists
  const hasReports = history.length > 0;

  return (
    <Card className="mt-4">
      <CardHeader className="pb-2 cursor-pointer" onClick={() => setShowPanel(!showPanel)}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <svg className="h-4 w-4 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <CardTitle className="text-base">分析报告历史</CardTitle>
            <span className="text-xs text-muted-foreground">({history.length})</span>
          </div>
          <span className="text-xs text-muted-foreground">{showPanel ? "收起" : "展开"}</span>
        </div>
        <CardDescription>{hasReports ? "过往AI分析报告存档" : "进行AI分析后报告将自动存档在此处"}</CardDescription>
      </CardHeader>
      {showPanel && (
        <CardContent>
          {viewingReport ? (
            <div>
              <button onClick={() => setViewing(null)} className="text-xs text-primary hover:underline mb-3 inline-block">
                ← 返回列表
              </button>
              <div className="prose prose-sm max-w-none dark:prose-invert">
                <p className="text-xs text-muted-foreground mb-2">
                  {viewingReport.name} ({viewingReport.symbol}) · {new Date(viewingReport.createdAt).toLocaleString("zh-CN")} · 模型: {viewingReport.models.join(", ")}
                </p>
                <div className="whitespace-pre-wrap text-sm leading-relaxed max-h-[500px] overflow-auto border border-border rounded-lg p-3"
                  dangerouslySetInnerHTML={{
                    __html: sanitizeHtml(viewingReport.content
                      .replace(/### (.*)/g, '<h3 class="text-base font-semibold mt-4 mb-2">$1</h3>')
                      .replace(/## (.*)/g, '<h2 class="text-lg font-bold mt-5 mb-2">$1</h2>')
                      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                      .replace(/- (.*)/g, '<li class="ml-4 text-muted-foreground">$1</li>')
                      .replace(/\n\n/g, '<br/><br/>')),
                  }}
                />
                <button onClick={() => handleDelete(viewingReport.id)} className="text-xs text-destructive hover:underline mt-3">
                  删除此报告
                </button>
              </div>
            </div>
          ) : hasReports ? (
            <div className="space-y-1 max-h-64 overflow-auto">
              {history.map(r => (
                <div key={r.id} className="flex items-center justify-between rounded-lg p-2 hover:bg-accent transition-all">
                  <button onClick={() => setViewing(r.id)} className="flex items-center gap-3 flex-1 text-left">
                    <span className="font-mono text-xs font-medium">{r.symbol}</span>
                    <span className="text-xs truncate flex-1">{r.name}</span>
                    <span className="text-[10px] text-muted-foreground">{new Date(r.createdAt).toLocaleDateString("zh-CN")}</span>
                  </button>
                  <button onClick={() => handleDelete(r.id)} className="text-muted-foreground hover:text-destructive text-xs ml-2">删除</button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground text-center py-4">暂无分析报告历史。进行AI分析后报告将自动存档。</p>
          )}
        </CardContent>
      )}
    </Card>
  );
}
