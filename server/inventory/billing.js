// Bill arithmetic, copied from Stock Management (shared/billing.mjs) so a bill placed here
// is priced exactly as the till would price it. Keep the two in step.
//
// Order of operations (Indian restaurant bill):
//   subtotal  = Σ qty × price
//   discount  = flat ₹, capped at subtotal
//   service   = optional % of (subtotal − discount). Must be voluntary for the guest (CCPA 2022 guidelines).
//   taxable   = subtotal − discount + service      (GST applies to service charge too)
//   CGST/SGST = tax_rate / 2 each on taxable        (5% GST for restaurants → 2.5% + 2.5%)
//   total     = rounded to the nearest rupee; the difference is shown as round-off.

export const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
export const round3 = (n) => Math.round((Number(n) + Number.EPSILON) * 1000) / 1000;

const nonNeg = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

export function computeTotals(lineTotals, { discount = 0, service_rate = 0, tax_rate = 5 } = {}) {
  const subtotal = round2(lineTotals.reduce((s, t) => s + Number(t || 0), 0));
  const disc = round2(Math.min(nonNeg(discount), subtotal));
  const net = round2(subtotal - disc);
  const service_charge = round2((net * nonNeg(service_rate)) / 100);
  const taxable = round2(net + service_charge);
  const cgst = round2((taxable * nonNeg(tax_rate)) / 200);
  const sgst = cgst;
  const gross = round2(taxable + cgst + sgst);
  const total = Math.round(gross);
  return {
    subtotal,
    discount: disc,
    service_charge,
    taxable,
    cgst,
    sgst,
    tax: round2(cgst + sgst),
    round_off: round2(total - gross),
    total,
  };
}

// Indian financial year (April–March) for a YYYY-MM-DD business date: '2026-11-06' → '2026-27'.
export function financialYear(businessDate) {
  const [y, m] = businessDate.split('-').map(Number);
  const start = m >= 4 ? y : y - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
}

// GST invoice numbers must be ≤ 16 chars and unique per financial year: VAS/2627/00042 (14 chars).
export function formatBillNo(prefix, fy, n) {
  const [a, b] = fy.split('-');
  return `${prefix}/${a.slice(2)}${b}/${String(n).padStart(5, '0')}`;
}
