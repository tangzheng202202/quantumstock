/**
 * RiskDisclosure — 全站风险披露组件（合规）。
 *
 * 两个使用形态：
 *   <RiskDisclosure />        紧凑版：页脚/页面底部常驻
 *   <RiskDisclosure variant="report" /> 报告版：每份 AI 分析报告尾部
 */

import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

export function RiskDisclosure({
  variant = "compact",
  className,
}: {
  variant?: "compact" | "report";
  className?: string;
}) {
  const isReport = variant === "report";

  const content = (
    <>
      <div className="flex items-center gap-1.5 font-medium">
        <AlertTriangle className={cn("shrink-0", isReport ? "h-4 w-4" : "h-3 w-3")} />
        <span>风险提示与免责声明</span>
      </div>
      <p className={cn("mt-1 leading-relaxed text-muted-foreground", isReport ? "text-xs" : "text-[10px]")}>
        本平台所有内容（包括 AI 生成的分析、评级、回测结果与数据图表）仅供参考，
        <strong className="text-foreground">不构成任何投资建议、要约或承诺</strong>。
        证券、基金、加密货币等投资有风险，价格可能大幅波动甚至归零，过往业绩与回测表现不代表未来收益。
        AI 模型可能产生错误、过时或幻觉性内容，请务必独立判断并自行核实数据。
        据此操作，风险自担。本平台不承担由此产生的任何直接或间接损失。
        {isReport && (
          <>
            <br />
            <span className="text-muted-foreground/80">
              本报告由 AI 模型自动生成，生成时间 {new Date().toLocaleString("zh-CN")}；引用的市场数据可能存在延迟或误差。
            </span>
          </>
        )}
      </p>
    </>
  );

  return (
    <footer
      role="note"
      aria-label="风险提示与免责声明"
      className={cn(
        "rounded-lg border border-border bg-muted/40 p-3",
        isReport && "border-dashed",
        className
      )}
    >
      {content}
    </footer>
  );
}
