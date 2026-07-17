"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AVAILABLE_MODELS } from "@/lib/ai/client";
import { cn } from "@/lib/utils";
import { saveAPIKeys, loadAPIKeys, testAPIKey } from "@/lib/storage/api-keys";
import {
  Brain,
  Bell,
  Shield,
  Database,
  Palette,
  Eye,
  EyeOff,
  CheckCircle2,
  XCircle,
  Save,
  Check,
  Loader2,
  Wifi,
  WifiOff,
} from "lucide-react";

const SETTINGS_TABS = [
  { id: "ai", label: "AI模型", icon: Brain },
  { id: "data", label: "数据源", icon: Database },
  { id: "notifications", label: "通知", icon: Bell },
  { id: "appearance", label: "外观", icon: Palette },
  { id: "security", label: "安全", icon: Shield },
];

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState("ai");
  const [apiKeys, setApiKeys] = useState({
    claude: "",
    openai: "",
    deepseek: "",
    minimax: "",
  });
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
  const [saved, setSaved] = useState(false);
  const [testing, setTesting] = useState<Record<string, boolean>>({});
  const [keyStatus, setKeyStatus] = useState<Record<string, "idle" | "valid" | "invalid">>({});
  const [keyErrors, setKeyErrors] = useState<Record<string, string>>({});

  // Load saved keys on mount
  useEffect(() => {
    const saved = loadAPIKeys();
    if (Object.keys(saved).length > 0) {
      setApiKeys(prev => ({
        claude: saved.claude ?? prev.claude,
        openai: saved.openai ?? prev.openai,
        deepseek: saved.deepseek ?? prev.deepseek,
        minimax: saved.minimax ?? prev.minimax,
      }));
    }
  }, []);

  const handleSave = () => {
    const keys: Record<string, string> = {};
    if (apiKeys.claude && apiKeys.claude.length > 10) keys.claude = apiKeys.claude;
    if (apiKeys.openai && apiKeys.openai.length > 10) keys.openai = apiKeys.openai;
    if (apiKeys.deepseek && apiKeys.deepseek.length > 10) keys.deepseek = apiKeys.deepseek;
    if (apiKeys.minimax && apiKeys.minimax.length > 10) keys.minimax = apiKeys.minimax;
    saveAPIKeys(keys);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleTestKey = async (provider: string) => {
    const key = apiKeys[provider as keyof typeof apiKeys];
    if (!key || key.length <= 10) return;

    setTesting(prev => ({ ...prev, [provider]: true }));
    setKeyStatus(prev => ({ ...prev, [provider]: "idle" }));
    setKeyErrors(prev => ({ ...prev, [provider]: "" }));

    // Save first to ensure latest key is in localStorage
    handleSave();

    try {
      const result = await testAPIKey(provider, key);
      if (result.valid) {
        setKeyStatus(prev => ({ ...prev, [provider]: "valid" }));
      } else {
        setKeyStatus(prev => ({ ...prev, [provider]: "invalid" }));
        setKeyErrors(prev => ({ ...prev, [provider]: result.error ?? "未知错误" }));
      }
    } catch {
      setKeyStatus(prev => ({ ...prev, [provider]: "invalid" }));
      setKeyErrors(prev => ({ ...prev, [provider]: "网络错误，请检查网络连接" }));
    } finally {
      setTesting(prev => ({ ...prev, [provider]: false }));
    }
  };


  return (
    <div className="flex flex-col gap-6 animate-fade-in max-w-[1200px] mx-auto">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">系统设置</h1>
        <p className="text-sm text-muted-foreground mt-1">
          配置AI模型、API密钥、数据源和通知偏好
        </p>
      </div>

      <div className="flex gap-6">
        {/* Tab Navigation */}
        <div className="w-48 shrink-0 space-y-1">
          {SETTINGS_TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-all text-left",
                activeTab === tab.id
                  ? "bg-primary/10 text-primary font-medium"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              )}
            >
              <tab.icon className="h-4 w-4" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 space-y-6">
          {/* AI Model Settings */}
          {activeTab === "ai" && (
            <>
              <Card>
                <CardHeader>
                  <CardTitle>API密钥配置</CardTitle>
                  <CardDescription>
                    配置各AI模型的API密钥。密钥以Base64编码存储在浏览器本地。
                  </CardDescription>
                  <div className="mt-2 rounded-lg border border-warning/30 bg-warning/10 p-3">
                    <p className="text-xs text-warning font-medium">⚠️ 安全提示</p>
                    <p className="text-[10px] text-muted-foreground mt-1">
                      API Key 存储在浏览器 localStorage 中（Base64 编码，非加密）。
                      <strong>请勿在公共电脑上配置 Key</strong>。
                      如需更高安全性，请在服务端 <code className="bg-muted px-1 rounded">.env.local</code> 中配置环境变量
                      <code className="bg-muted px-1 rounded">ANTHROPIC_API_KEY</code> /
                      <code className="bg-muted px-1 rounded">OPENAI_API_KEY</code> /
                      <code className="bg-muted px-1 rounded">DEEPSEEK_API_KEY</code>。
                    </p>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {[
                    { provider: "claude", label: "Anthropic Claude", description: "用于深度分析和复杂推理" },
                    { provider: "openai", label: "OpenAI GPT", description: "用于多模态分析和图表识别" },
                    { provider: "deepseek", label: "DeepSeek", description: "高性价比推理，中国市场分析" },
                    { provider: "minimax", label: "MiniMax", description: "中文优化，A股情绪分析" },
                  ].map(({ provider, label, description }) => (
                    <div key={provider}>
                      <div className="flex items-center gap-4">
                      <div className="flex-1">
                        <p className="text-sm font-medium">{label}</p>
                        <p className="text-xs text-muted-foreground">{description}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="relative">
                          <input
                            type={showKeys[provider] ? "text" : "password"}
                            value={apiKeys[provider as keyof typeof apiKeys]}
                            onChange={(e) => {
                              setApiKeys({ ...apiKeys, [provider]: e.target.value });
                              setKeyStatus(prev => ({ ...prev, [provider]: "idle" }));
                            }}
                            className="w-64 rounded-lg border border-input bg-background px-3 py-1.5 text-xs font-mono pr-8"
                            placeholder={`输入${label} API密钥`}
                          />
                          <button
                            onClick={() =>
                              setShowKeys({ ...showKeys, [provider]: !showKeys[provider] })
                            }
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"
                          >
                            {showKeys[provider] ? (
                              <EyeOff className="h-3.5 w-3.5" />
                            ) : (
                              <Eye className="h-3.5 w-3.5" />
                            )}
                          </button>
                        </div>
                        <div className="flex items-center gap-1">
                          {keyStatus[provider] === "valid" ? (
                            <span className="flex items-center gap-1 text-[10px] text-success"><Wifi className="h-2.5 w-2.5" /> 有效</span>
                          ) : keyStatus[provider] === "invalid" ? (
                            <span className="flex items-center gap-1 text-[10px] text-destructive"><WifiOff className="h-2.5 w-2.5" /> 无效</span>
                          ) : apiKeys[provider as keyof typeof apiKeys]?.length > 10 ? (
                            <span className="flex items-center gap-1 text-[10px] text-muted-foreground"><CheckCircle2 className="h-2.5 w-2.5" /> 已填写</span>
                          ) : (
                            <span className="flex items-center gap-1 text-[10px] text-muted-foreground/40"><XCircle className="h-2.5 w-2.5" /> 未配置</span>
                          )}
                        </div>
                      </div>
                      </div>
                      {/* Test button and status */}
                      {apiKeys[provider as keyof typeof apiKeys]?.length > 10 && (
                        <div className="ml-[calc(100%-20rem)] mt-1 flex items-center gap-2">
                          <button
                            onClick={() => handleTestKey(provider)}
                            disabled={testing[provider]}
                            className="rounded-md border border-border px-2 py-0.5 text-[10px] text-muted-foreground hover:bg-accent hover:text-foreground transition-all disabled:opacity-50 flex items-center gap-1"
                          >
                            {testing[provider] ? (
                              <><Loader2 className="h-2.5 w-2.5 animate-spin" /> 测试中...</>
                            ) : (
                              "测试连接"
                            )}
                          </button>
                          {keyStatus[provider] === "valid" && (
                            <span className="text-[10px] text-success">✓ 连接成功</span>
                          )}
                          {keyStatus[provider] === "invalid" && keyErrors[provider] && (
                            <span className="text-[10px] text-destructive truncate max-w-[300px]" title={keyErrors[provider]}>
                              ✗ {keyErrors[provider].slice(0, 60)}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </CardContent>
              </Card>

              {/* Save button */}
              <div className="flex items-center gap-3">
                <button
                  onClick={handleSave}
                  className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-all flex items-center gap-2"
                >
                  {saved ? <Check className="h-4 w-4" /> : <Save className="h-4 w-4" />}
                  {saved ? "已保存" : "保存密钥"}
                </button>
                <p className="text-[10px] text-muted-foreground">
                  密钥将经过编码后存储在浏览器本地，不会上传到服务器
                </p>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle>模型管理</CardTitle>
                  <CardDescription>启用或禁用AI模型，调整默认模型偏好</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  {AVAILABLE_MODELS.map((model) => (
                    <div
                      key={model.id}
                      className="flex items-center justify-between rounded-lg border border-border p-3"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                          <Brain className="h-4 w-4 text-primary" />
                        </div>
                        <div>
                          <p className="text-sm font-medium">{model.name}</p>
                          <p className="text-[10px] text-muted-foreground">
                            {model.description}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="flex gap-1">
                          {model.capabilities.map((cap) => (
                            <span
                              key={cap}
                              className="rounded-full bg-muted px-1.5 py-0.5 text-[9px] text-muted-foreground"
                            >
                              {cap}
                            </span>
                          ))}
                        </div>
                        <button
                          className={cn(
                            "relative inline-flex h-6 w-10 items-center rounded-full transition-all",
                            model.isEnabled ? "bg-primary" : "bg-muted"
                          )}
                        >
                          <span
                            className={cn(
                              "inline-block h-4 w-4 rounded-full bg-white transition-all",
                              model.isEnabled ? "translate-x-5" : "translate-x-1"
                            )}
                          />
                        </button>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </>
          )}

          {/* Data Source Settings */}
          {activeTab === "data" && (
            <Card>
              <CardHeader>
                <CardTitle>数据源配置</CardTitle>
                <CardDescription>配置行情和财务数据来源</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {[
                  { name: "Tushare Pro", description: "A股行情和财务数据", status: "active", market: "A股" },
                  { name: "AKShare", description: "免费开源A股数据", status: "active", market: "A股" },
                  { name: "Polygon.io", description: "美股实时行情数据", status: "inactive", market: "美股" },
                  { name: "Yahoo Finance", description: "全球市场免费数据", status: "active", market: "全球" },
                  { name: "CCXT", description: "加密货币交易所统一接口", status: "active", market: "加密" },
                ].map((source) => (
                  <div key={source.name} className="flex items-center justify-between rounded-lg border border-border p-3">
                    <div>
                      <p className="text-sm font-medium">{source.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {source.description} · {source.market}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={cn(
                        "rounded-full px-2 py-0.5 text-[10px]",
                        source.status === "active"
                          ? "bg-success/10 text-success"
                          : "bg-muted text-muted-foreground"
                      )}>
                        {source.status === "active" ? "已连接" : "未连接"}
                      </span>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Notification Settings */}
          {activeTab === "notifications" && (
            <Card>
              <CardHeader>
                <CardTitle>通知偏好</CardTitle>
                <CardDescription>配置预警通知方式和频率</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {[
                  { name: "应用内通知", description: "在平台内实时推送预警", channels: ["app"] },
                  { name: "邮件通知", description: "通过邮件发送重要预警", channels: ["email"] },
                  { name: "Webhook", description: "自定义Webhook推送（支持企业微信、钉钉等）", channels: ["webhook"] },
                ].map((notif) => (
                  <div key={notif.name} className="flex items-center justify-between rounded-lg border border-border p-3">
                    <div>
                      <p className="text-sm font-medium">{notif.name}</p>
                      <p className="text-xs text-muted-foreground">{notif.description}</p>
                    </div>
                    <button className="relative inline-flex h-6 w-10 items-center rounded-full bg-primary transition-all">
                      <span className="inline-block h-4 w-4 rounded-full bg-white translate-x-5 transition-all" />
                    </button>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Other tabs placeholder */}
          {activeTab === "appearance" && (
            <Card>
              <CardHeader>
                <CardTitle>外观设置</CardTitle>
                <CardDescription>主题、语言和布局偏好</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">主题切换: 支持亮色/暗色模式（通过顶部栏切换）</p>
              </CardContent>
            </Card>
          )}

          {activeTab === "security" && (
            <Card>
              <CardHeader>
                <CardTitle>安全设置</CardTitle>
                <CardDescription>账户安全和隐私配置</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex items-center justify-between rounded-lg border border-border p-3">
                    <div>
                      <p className="text-sm font-medium">两步验证</p>
                      <p className="text-xs text-muted-foreground">增加账户安全层</p>
                    </div>
                    <button className="rounded-lg border border-border px-3 py-1.5 text-xs hover:bg-accent transition-all">
                      启用
                    </button>
                  </div>
                  <div className="flex items-center justify-between rounded-lg border border-border p-3">
                    <div>
                      <p className="text-sm font-medium">会话管理</p>
                      <p className="text-xs text-muted-foreground">管理活跃登录会话</p>
                    </div>
                    <button className="rounded-lg border border-border px-3 py-1.5 text-xs hover:bg-accent transition-all">
                      管理
                    </button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
