import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const SEED_STOCKS = [
  { symbol: "600519", name: "贵州茅台", nameCn: "贵州茅台", market: "SSE", sector: "白酒", industry: "白酒制造", currency: "CNY" },
  { symbol: "300750", name: "宁德时代", nameCn: "宁德时代", market: "SZSE", sector: "新能源汽车", industry: "电池制造", currency: "CNY" },
  { symbol: "000858", name: "五粮液", nameCn: "五粮液", market: "SZSE", sector: "白酒", industry: "白酒制造", currency: "CNY" },
  { symbol: "002594", name: "比亚迪", nameCn: "比亚迪", market: "SZSE", sector: "新能源汽车", industry: "汽车制造", currency: "CNY" },
  { symbol: "601398", name: "工商银行", nameCn: "工商银行", market: "SSE", sector: "银行", industry: "银行业", currency: "CNY" },
  { symbol: "688981", name: "中芯国际", nameCn: "中芯国际", market: "SSE", sector: "半导体", industry: "半导体制造", currency: "CNY" },
  { symbol: "600036", name: "招商银行", nameCn: "招商银行", market: "SSE", sector: "银行", industry: "银行业", currency: "CNY" },
  { symbol: "601318", name: "中国平安", nameCn: "中国平安", market: "SSE", sector: "保险", industry: "保险业", currency: "CNY" },
  { symbol: "300059", name: "东方财富", nameCn: "东方财富", market: "SZSE", sector: "券商", industry: "证券业", currency: "CNY" },
  { symbol: "000001", name: "平安银行", nameCn: "平安银行", market: "SZSE", sector: "银行", industry: "银行业", currency: "CNY" },
] as const;

async function main() {
  console.log("🌱 Seeding QuantumStock database...");

  for (const s of SEED_STOCKS) {
    await prisma.stock.upsert({
      where: { symbol: s.symbol },
      update: { name: s.name, nameCn: s.nameCn, sector: s.sector, industry: s.industry, currency: s.currency },
      create: s,
    });
  }

  console.log(`✅ Seeded ${SEED_STOCKS.length} stocks`);
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
