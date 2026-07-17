// ========== Market Types ==========

export type Market = "SSE" | "SZSE" | "HKEX" | "NASDAQ" | "NYSE" | "CRYPTO" | "FOREX" | "UNKNOWN";

export type QuoteInterval = "1m" | "5m" | "15m" | "30m" | "1h" | "4h" | "1d" | "1w" | "1M";

export interface StockInfo {
  symbol: string;
  name: string;
  nameCn?: string;
  market: Market;
  sector?: string;
  industry?: string;
  marketCap?: number;
  currency: string;
}

export interface OHLCV {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface Quote extends OHLCV {
  amount?: number;
  turnover?: number;
  change: number;
  changePercent: number;
}

export interface TickerData {
  stock: StockInfo;
  quote: Quote;
  updatedAt: number;
}

// ========== Financial Types ==========

export interface FinancialData {
  reportDate: string;
  reportType: "Q1" | "Q2" | "Q3" | "Q4" | "Annual";
  revenue?: number;
  netProfit?: number;
  eps?: number;
  pe?: number;
  pb?: number;
  roe?: number;
  debtRatio?: number;
  grossMargin?: number;
  netMargin?: number;
  yoyRevenue?: number;
  yoyProfit?: number;
}

// ========== Market Index Types ==========

export interface MarketIndex {
  id: string;
  name: string;
  market: Market;
  value: number;
  change: number;
  changePercent: number;
  high52w?: number;
  low52w?: number;
}

export interface MarketHeatmapItem {
  sector: string;
  sectorCode?: string;
  changePercent: number;
  volume: number;
  leadingStock?: string;
}

export interface SectorRotation {
  sector: string;
  momentum: number;   // -100 to 100
  trend: "leading" | "improving" | "weakening" | "lagging";
}

// ========== AI Analysis Types ==========

export type AIProvider = "claude" | "openai" | "deepseek" | "minimax" | "local";

export interface AIModel {
  id: string;
  provider: AIProvider;
  name: string;
  description: string;
  capabilities: AICapability[];
  isEnabled: boolean;
  costPer1kTokens?: number;
}

export type AICapability = "analysis" | "reasoning" | "coding" | "creative" | "multimodal";

export interface AnalysisSkill {
  id: string;
  name: string;
  nameCn: string;
  description: string;
  icon: string;
  prompt: string;
  category: "technical" | "fundamental" | "sentiment" | "industry" | "risk";
}

export interface AnalysisRequest {
  stock: StockInfo;
  models: string[];       // model IDs
  skills: string[];       // skill IDs
  focusAreas?: string[];
  customPrompt?: string;
  apiKeys?: Record<AIProvider, string>;  // client-provided API keys (overrides env vars)
}

export interface AnalysisResult {
  id: string;
  stock: StockInfo;
  modelId: string;
  modelName: string;
  content: string;        // markdown
  rating?: number;        // 1-5
  confidence?: number;    // 0-1
  skills: string[];
  createdAt: string;
  tokensUsed?: number;
  cost?: number;
}

// ========== Screener Types ==========

export interface ScreenerFilter {
  id: string;
  type: "technical" | "fundamental" | "volume" | "market" | "ai";
  field: string;
  operator: "gt" | "lt" | "gte" | "lte" | "eq" | "between" | "cross_above" | "cross_below";
  value: number | string;
  value2?: number | string;
}

export interface ScreenerPreset {
  id: string;
  name: string;
  description: string;
  filters: ScreenerFilter[];
  isBuiltin: boolean;
}

export interface ScreenerResult {
  stock: StockInfo;
  quote: Quote;
  matchScore: number;
  matchedFilters: string[];
}

// ========== Strategy & Backtest Types ==========

export interface StrategyDefinition {
  id: string;
  name: string;
  description: string;
  type: "builtin" | "custom";
  params: StrategyParam[];
  code?: string;  // JSON strategy DSL
}

export interface StrategyParam {
  name: string;
  label: string;
  type: "number" | "select" | "boolean";
  default: number | string | boolean;
  min?: number;
  max?: number;
  step?: number;
  options?: { label: string; value: string }[];
}

export interface BacktestConfig {
  strategyId: string;
  symbols: string[];
  startDate: string;
  endDate: string;
  initialCapital: number;
  commission: number;  // 0.0003 = 0.03%
  slippage: number;    // 0.001 = 0.1%
  params: Record<string, number | string | boolean>;
}

export interface BacktestResult {
  id: string;
  strategyName: string;
  config: BacktestConfig;
  metrics: BacktestMetrics;
  equityCurve: { date: string; value: number }[];
  trades: BacktestTrade[];
  monthlyReturns: { month: string; return_: number }[];
  createdAt: string;
}

export interface BacktestMetrics {
  totalReturn: number;
  annualReturn: number;
  maxDrawdown: number;
  maxDrawdownDuration: number;
  sharpeRatio: number;
  sortinoRatio: number;
  calmarRatio: number;
  winRate: number;
  profitFactor: number;
  avgWin: number;
  avgLoss: number;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  avgHoldDays: number;
}

export interface BacktestTrade {
  entryDate: string;
  exitDate: string;
  symbol: string;
  side: "long" | "short";
  entryPrice: number;
  exitPrice: number;
  quantity: number;
  pnl: number;
  pnlPercent: number;
  holdDays: number;
}

// ========== Portfolio Types ==========

export interface PortfolioData {
  id: string;
  name: string;
  totalValue: number;
  cash: number;
  positions: PortfolioPosition[];
  dayPnl: number;
  dayPnlPercent: number;
  totalPnl: number;
  totalPnlPercent: number;
  riskMetrics: PortfolioRisk;
  currency: string;
}

export interface PortfolioPosition {
  stock: StockInfo;
  quantity: number;
  avgCost: number;
  currentPrice: number;
  marketValue: number;
  pnl: number;
  pnlPercent: number;
  weight: number;
}

export interface PortfolioRisk {
  var95: number;
  var99: number;
  beta: number;
  volatility: number;
  sharpeRatio: number;
  maxDrawdown: number;
}

export interface PortfolioHistoryPoint {
  date: string;
  value: number;
  pnl: number;
}

// ========== Alert Types ==========

export interface AlertRule {
  id: string;
  type: "price" | "indicator" | "volume" | "news";
  stockSymbol?: string;
  condition: "above" | "below" | "cross_above" | "cross_below" | "change_up" | "change_down";
  value?: number;
  indicator?: string;
  params: Record<string, unknown>;
  isEnabled: boolean;
  isTriggered: boolean;
  triggeredAt?: string;
  channel: ("app" | "email" | "webhook")[];
}

// ========== API Response Types ==========

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  meta?: {
    timestamp: number;
    cached: boolean;
    source: string;
  };
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

// ========== Industry Chain Types ==========

export interface IndustryChainNode {
  company: StockInfo;
  role: "supplier" | "manufacturer" | "distributor" | "service" | "tooling";
  tier: number;  // 1=direct, 2=secondary, etc.
  description: string;
  revenueShare?: number;
}

export interface IndustryChain {
  id: string;
  name: string;
  description: string;
  nodes: IndustryChainNode[];
  relations: { from: string; to: string; type: string }[];
}
