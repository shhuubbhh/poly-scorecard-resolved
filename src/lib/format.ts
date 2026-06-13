export const fmtUSD = (n: number) =>
  n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });

export const fmtNum = (n: number) => n.toLocaleString("en-US");

export const fmtAddress = (addr: string) =>
  addr.length > 12 ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : addr;
