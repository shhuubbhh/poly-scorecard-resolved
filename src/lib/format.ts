export const fmtUSD = (n: number | undefined | null) => {
  const num = Number(n);
  if (!Number.isFinite(num)) return "$0";
  return num.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
};

export const fmtNum = (n: number | undefined | null) => {
  const num = Number(n);
  if (!Number.isFinite(num)) return "0";
  return num.toLocaleString("en-US");
};

export const fmtAddress = (addr: string) =>
  addr.length > 12 ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : addr;
