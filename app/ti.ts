export default function TiUtilities() { return null; }

export type InvoiceItem = {
  desc: string;
  qty: number;
  rate: number;
  gst: number;
  hsn?: string;
  code?: string;
  unit?: string;
  disc?: number;
};

export type InvoiceTotals = {
  taxable: number;
  gstTotal: number;
  grand: number;
};

export type InvoiceInput = {
  invoiceNo: string;
  date: string;
  buyer: string;
  mobile: string;
  items: InvoiceItem[];
  buyerEmail?: string;
};

/* matches SellerData from sellerInfo.ts exactly */
export type SellerInfo = {
  name: string;
  tag: string;
  email: string;
  address: string;
  city: string;
  state: string;
  pin: string;
  gst: string;
  pan: string;
  bank: Record<string, any>;
  signatory: { name?: string; designation?: string };
} | null;

/* ══════════════ HELPERS ══════════════ */

function fmtN(n: number): string {
  return (+n || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function fmtD(s: string): string {
  if (!s) return "—";
  const d = new Date(s);
  return isNaN(d.getTime())
    ? s
    : d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function n2w(n: number): string {
  const o = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
    "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
  const t = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
  if (!n) return "Zero";
  function h(x: number): string {
    if (!x) return "";
    if (x < 20) return o[x] + " ";
    if (x < 100) return t[~~(x / 10)] + " " + (o[x % 10] ? o[x % 10] + " " : "");
    return o[~~(x / 100)] + " Hundred " + (x % 100 ? h(x % 100) : "");
  }
  let w = "", num = n;
  const cr = ~~(num / 1e7); num %= 1e7;
  const lk = ~~(num / 1e5); num %= 1e5;
  const th = ~~(num / 1e3); num %= 1e3;
  if (cr) w += h(cr) + "Crore ";
  if (lk) w += h(lk) + "Lakh ";
  if (th) w += h(th) + "Thousand ";
  if (num) w += h(num);
  return w.trim();
}

function amtInWords(total: number): string {
  const r = ~~total;
  const p = Math.round((total - r) * 100);
  return "Rupees " + n2w(r) + (p ? " and " + n2w(p) + " Paise" : "") + " Only";
}

/* Income Tax financial year: April 1 → March 31 */
function getFinancialYear(dateStr: string): { label: string; start: number; end: number } {
  const d = new Date(dateStr || Date.now());
  const year = d.getFullYear();
  const month = d.getMonth(); // 0-based; April = 3
  const start = month >= 3 ? year : year - 1;
  const end = start + 1;
  return {
    label: `${start}-${String(end).slice(2)}`,
    start,
    end,
  };
}

/* Render bank object as a small readable table.
   FIX: previously Object.entries produced "[object Object]" for nested values. */
function renderBank(bank: Record<string, any>): string {
  if (!bank || typeof bank !== "object" || Array.isArray(bank)) return "<em>—</em>";

  const labelMap: Record<string, string> = {
    accountNumber: "A/C No",
    account_number: "A/C No",
    accountNo: "A/C No",
    ifsc: "IFSC",
    ifscCode: "IFSC",
    ifsc_code: "IFSC",
    bankName: "Bank",
    bank_name: "Bank",
    branch: "Branch",
    branchName: "Branch",
    holderName: "Holder",
    holder_name: "Holder",
  };

  const rows = Object.entries(bank)
    .filter(([, v]) => v !== null && v !== undefined && typeof v !== "object" && String(v).trim() !== "")
    .map(([k, v]) =>
      `<tr>
              <td style="color:#6b6560;padding:2px 4px 2px 0;font-size:10.5px;white-space:nowrap">${labelMap[k] || k}</td>
              <td style="font-weight:600;padding:2px 0;font-size:10.5px">${v}</td>
            </tr>`
    );

  return rows.length
    ? `<table style="border-collapse:collapse;width:100%">${rows.join("")}</table>`
    : "<em>—</em>";
}

/* Per-item GST calc (CGST + SGST split, intrastate) */
function calcItem(item: InvoiceItem) {
  const disc = item.disc ?? 0;
  const gross = item.qty * item.rate;
  const discAmt = gross * (disc / 100);
  const taxable = gross - discAmt;
  const cgst = taxable * ((item.gst / 2) / 100);
  const sgst = cgst;
  const total = taxable + cgst + sgst;
  return { gross, discAmt, taxable, cgst, sgst, total };
}

/* ══════════════════════════════════════════════════════════════
   MAIN EXPORT
══════════════════════════════════════════════════════════════ */
export function getInvoiceHTML({
  seller,
  invoice,
  totals,
}: {
  seller: SellerInfo;
  invoice: InvoiceInput;
  totals: InvoiceTotals;
}): string {

  /* ── safely unwrap seller (may be null if hook hasn't resolved yet) ── */
  const name = seller?.name || "—";
  const tag = seller?.tag || "";
  const email = seller?.email || "";
  const address = seller?.address || "";
  const city = seller?.city || "";
  const state = seller?.state || "";
  const pin = seller?.pin || "";
  const gst = seller?.gst || "—";
  const pan = seller?.pan || "—";
  const bank = seller?.bank || {};
  const sigName = seller?.signatory?.name || "";
  const sigDesig = seller?.signatory?.designation || "";

  const sellerAddr = [address, city, state, pin].filter(Boolean).join(", ") || "—";

  const fy = getFinancialYear(invoice.date);
  const fyLabel = fy.label;
  const fyRangeLabel = `1 Apr ${fy.start} – 31 Mar ${fy.end}`;

  /* ── per-line calcs ── */
  const calced = invoice.items.map(it => ({ ...it, ...calcItem(it) }));
  let sumGross = 0, sumDisc = 0, sumTaxable = 0, sumCGST = 0, sumSGST = 0;
  calced.forEach(c => {
    sumGross += c.gross;
    sumDisc += c.discAmt;
    sumTaxable += c.taxable;
    sumCGST += c.cgst;
    sumSGST += c.sgst;
  });
  const totalTax = sumCGST + sumSGST;
  const rawGrand = sumTaxable + totalTax;
  const roundOff = Math.round(rawGrand) - rawGrand;
  const grand = rawGrand + roundOff;

  /* ── item rows ── */
  const itemRows = calced.map((c, i) => `
    <tr>
      <td style="text-align:left;padding:6px 8px">${i + 1}</td>
      <td style="text-align:left;padding:6px 8px">${c.code || "—"}</td>
      <td style="text-align:left;padding:6px 8px">${c.desc || "—"}</td>
      <td style="text-align:left;padding:6px 8px">${c.hsn || "—"}</td>
      <td style="text-align:right;padding:6px 8px">${c.qty}</td>
      <td style="text-align:left;padding:6px 8px">${c.unit || "PCS"}</td>
      <td style="text-align:right;padding:6px 8px;font-family:monospace">${fmtN(c.rate)}</td>
      <td style="text-align:right;padding:6px 8px">${c.disc ?? 0}%</td>
      <td style="text-align:right;padding:6px 8px;font-family:monospace">${fmtN(c.taxable)}</td>
      <td style="text-align:right;padding:6px 8px">${c.gst / 2}%</td>
      <td style="text-align:right;padding:6px 8px;font-family:monospace">${fmtN(c.cgst)}</td>
      <td style="text-align:right;padding:6px 8px">${c.gst / 2}%</td>
      <td style="text-align:right;padding:6px 8px;font-family:monospace">${fmtN(c.sgst)}</td>
      <td style="text-align:right;padding:6px 8px;font-family:monospace"><strong>${fmtN(c.total)}</strong></td>
    </tr>`).join("");

  /* ── HSN summary ── */
  const hsnMap: Record<string, { taxable: number; cgst: number; sgst: number; rate: number }> = {};
  calced.forEach(c => {
    const k = c.hsn || "—";
    if (!hsnMap[k]) hsnMap[k] = { taxable: 0, cgst: 0, sgst: 0, rate: c.gst };
    hsnMap[k].taxable += c.taxable;
    hsnMap[k].cgst += c.cgst;
    hsnMap[k].sgst += c.sgst;
  });
  const hsnRows = Object.entries(hsnMap).map(([hsn, v]) => `
    <tr>
      <td style="text-align:left;padding:5px 6px">${hsn}</td>
      <td style="text-align:right;padding:5px 6px;font-family:monospace">${fmtN(v.taxable)}</td>
      <td style="text-align:right;padding:5px 6px">${v.rate / 2}%</td>
      <td style="text-align:right;padding:5px 6px;font-family:monospace">${fmtN(v.cgst)}</td>
      <td style="text-align:right;padding:5px 6px">${v.rate / 2}%</td>
      <td style="text-align:right;padding:5px 6px;font-family:monospace">${fmtN(v.sgst)}</td>
      <td style="text-align:right;padding:5px 6px;font-family:monospace">${fmtN(v.cgst + v.sgst)}</td>
    </tr>`).join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Tax Invoice – ${invoice.invoiceNo}</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=EB+Garamond:wght@400;600;700&family=Outfit:wght@300;400;500;600;700&display=swap');
:root{--pri:#1a3c6b;--acc:#c8973a;--accl:#f0d9a8;--bdr:#d4cfc6;--muted:#6b6560}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Outfit',sans-serif;background:#fff;color:#1a1a1a;font-size:11.5px;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.copy-lbl{background:var(--acc);color:#fff;font-size:9.5px;font-weight:700;letter-spacing:.15em;text-transform:uppercase;padding:5px;text-align:center}
.inv-hdr{background:var(--pri);color:#fff;display:flex;justify-content:space-between;align-items:flex-start;padding:20px 28px 15px;gap:16px}
.inv-cname{font-family:'EB Garamond',serif;font-size:24px;font-weight:700;line-height:1.1}
.inv-ctag{font-size:11px;color:rgba(255,255,255,.6);margin-top:3px}
.inv-fy{font-size:10px;color:rgba(255,255,255,.45);margin-top:5px;letter-spacing:.03em}
.inv-dtitle{font-size:19px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--accl);text-align:right}
.inv-dsub{font-size:10px;color:rgba(255,255,255,.5);text-transform:uppercase;letter-spacing:.07em;text-align:right;margin-top:3px}
.inv-stripe{height:4px;background:linear-gradient(90deg,var(--acc),#e8b866 60%,var(--acc))}
.inv-sbar{background:#f0ece4;padding:8px 28px;display:flex;gap:20px;flex-wrap:wrap;border-bottom:1px solid var(--bdr);font-size:11px;color:var(--muted)}
.inv-sbar b{color:#1a1a1a}
.inv-body{padding:16px 28px 20px}
.g3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:12px}
.ibox{border:1px solid var(--bdr);border-radius:4px;overflow:hidden}
.ibox-h{background:var(--pri);color:#fff;font-size:9px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;padding:5px 10px}
.ibox-b{padding:8px 10px;line-height:1.8;font-size:11.5px}
.itbl-wrap{margin-bottom:12px;border:1px solid var(--bdr);border-radius:4px;overflow:hidden}
table{width:100%;border-collapse:collapse}
.itbl thead tr{background:var(--pri);color:#fff}
.itbl thead th{padding:7px 8px;font-size:9.5px;font-weight:600;letter-spacing:.03em;white-space:nowrap;border-right:1px solid rgba(255,255,255,.1)}
.itbl thead th.al{text-align:left}.itbl thead th.ar{text-align:right}
.itbl tbody tr{border-bottom:1px solid var(--bdr)}
.itbl tbody tr:nth-child(even){background:#faf8f4}
.itbl tfoot tr{background:var(--pri);color:#fff}
.itbl tfoot td{padding:6px 8px;font-weight:700;font-size:10.5px;text-align:right}
.bgrid{display:grid;grid-template-columns:1fr 240px;gap:12px;margin-bottom:12px}
.ttbl thead tr{background:var(--pri);color:#fff}
.ttbl thead th{padding:5px 6px;font-size:9.5px;font-weight:600;text-align:right}
.ttbl thead th.al{text-align:left}
.ttbl tbody tr:nth-child(even){background:#faf8f4}
.ttbl tbody td{padding:5px 6px;border-bottom:1px solid var(--bdr)}
.ttbl tfoot td{padding:5px 6px;font-weight:700;text-align:right;background:#f0ece4;border-top:2px solid var(--bdr)}
.tr2{display:flex;justify-content:space-between;padding:4px 0;font-size:11px;border-bottom:1px dotted var(--bdr)}
.tr2:last-child{border:none}
.tr2.grand{background:var(--pri);color:#fff;margin:8px -10px -10px;padding:8px 10px;font-size:13px;font-weight:700;border-radius:0 0 4px 4px}
.tr2.grand span:last-child{color:var(--accl);font-family:monospace}
.inv-words{background:var(--accl);border:1px solid #d4b87a;border-radius:4px;padding:7px 11px;font-size:11px;margin-bottom:12px}
.inv-words b{color:var(--pri);font-size:9px;text-transform:uppercase;letter-spacing:.07em;display:block;margin-bottom:2px}
.inv-terms{border:1px solid var(--bdr);border-radius:4px;padding:9px 11px;margin-bottom:12px}
.inv-terms h4{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--pri);margin-bottom:5px}
.inv-terms ol{padding-left:16px}
.inv-terms li{font-size:10.5px;color:var(--muted);margin-bottom:2px}
.inv-foot{display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;border-top:2px solid var(--pri);padding-top:11px}
.ifb{text-align:center}
.sa{height:46px;border-bottom:1px solid var(--bdr);margin-bottom:4px}
.sl{font-size:9.5px;color:var(--muted);text-transform:uppercase;letter-spacing:.07em}
.sn{font-size:11px;font-weight:600;color:var(--pri)}
.inv-stamp{background:var(--pri);color:rgba(255,255,255,.55);font-size:9px;text-align:center;padding:7px 28px;letter-spacing:.05em}
@media print{body{background:#fff}.inv-hdr,.itbl thead tr,.itbl tfoot tr,.ttbl thead tr,.inv-stamp,.copy-lbl{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
</style>
</head>
<body>

<div class="copy-lbl">Original for Buyer</div>

<div class="inv-hdr">
  <div>
    <div class="inv-cname">${name}</div>
    ${tag ? `<div class="inv-ctag">${tag}</div>` : ""}
    <div class="inv-fy">FY ${fyLabel} &nbsp;·&nbsp; ${fyRangeLabel}</div>
  </div>
  <div>
    <div class="inv-dtitle">Tax Invoice</div>
    <div class="inv-dsub">GST Compliant · Original</div>
  </div>
</div>
<div class="inv-stripe"></div>

<div class="inv-sbar">
  <span>&#128205; <b>${sellerAddr}</b></span>
  ${email ? `<span>&#9993; <b>${email}</b></span>` : ""}
</div>

<div class="inv-body">

  <div class="g3">
    <div class="ibox">
      <div class="ibox-h">Seller Details</div>
      <div class="ibox-b">
        <strong>${name}</strong><br/>
        GSTIN: <strong>${gst}</strong><br/>
        PAN: <strong>${pan}</strong><br/>
        State: <strong>${state || "—"}</strong>
      </div>
    </div>
    <div class="ibox">
      <div class="ibox-h">Invoice Details</div>
      <div class="ibox-b">
        Invoice No: <strong>${invoice.invoiceNo || "—"}</strong><br/>
        Date: <strong>${fmtD(invoice.date)}</strong><br/>
        FY: <strong>${fyLabel}</strong><br/>
        Buyer: <strong>${invoice.buyer || "—"}</strong><br/>
        Mobile: <strong>${invoice.mobile || "—"}</strong>
      </div>
    </div>
    <div class="ibox">
      <div class="ibox-h">Bank Details</div>
      <div class="ibox-b">
        ${renderBank(bank)}
      </div>
    </div>
  </div>

  <div class="itbl-wrap">
    <table class="itbl">
      <thead>
        <tr>
          <th class="al">#</th>
          <th class="al">Code</th>
          <th class="al">Description</th>
          <th class="al">HSN/SAC</th>
          <th class="ar">Qty</th>
          <th class="al">Unit</th>
          <th class="ar">Rate (&#8377;)</th>
          <th class="ar">Disc%</th>
          <th class="ar">Taxable (&#8377;)</th>
          <th class="ar">CGST%</th>
          <th class="ar">CGST (&#8377;)</th>
          <th class="ar">SGST%</th>
          <th class="ar">SGST (&#8377;)</th>
          <th class="ar">Total (&#8377;)</th>
        </tr>
      </thead>
      <tbody>${itemRows}</tbody>
      <tfoot>
        <tr>
          <td colspan="8" style="text-align:left;font-size:9px;letter-spacing:.07em">TOTALS</td>
          <td style="font-family:monospace">${fmtN(sumTaxable)}</td>
          <td></td>
          <td style="font-family:monospace">${fmtN(sumCGST)}</td>
          <td></td>
          <td style="font-family:monospace">${fmtN(sumSGST)}</td>
          <td style="font-family:monospace">${fmtN(grand)}</td>
        </tr>
      </tfoot>
    </table>
  </div>

  <div class="bgrid">
    <div>
      <div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--pri);margin-bottom:5px">HSN-wise Tax Summary</div>
      <table class="ttbl" style="border:1px solid var(--bdr);border-radius:4px;overflow:hidden">
        <thead><tr>
          <th class="al">HSN/SAC</th>
          <th style="text-align:right">Taxable (&#8377;)</th>
          <th style="text-align:right">CGST%</th>
          <th style="text-align:right">CGST (&#8377;)</th>
          <th style="text-align:right">SGST%</th>
          <th style="text-align:right">SGST (&#8377;)</th>
          <th style="text-align:right">Tax Total</th>
        </tr></thead>
        <tbody>${hsnRows}</tbody>
        <tfoot><tr>
          <td style="text-align:left;padding:5px 6px"><strong>Total</strong></td>
          <td style="font-family:monospace"><strong>${fmtN(sumTaxable)}</strong></td>
          <td></td>
          <td style="font-family:monospace"><strong>${fmtN(sumCGST)}</strong></td>
          <td></td>
          <td style="font-family:monospace"><strong>${fmtN(sumSGST)}</strong></td>
          <td style="font-family:monospace"><strong>${fmtN(totalTax)}</strong></td>
        </tr></tfoot>
      </table>
    </div>
    <div class="ibox">
      <div class="ibox-h">Amount Summary</div>
      <div class="ibox-b" style="padding:10px">
        <div class="tr2"><span>Gross Amount</span><span style="font-family:monospace">&#8377; ${fmtN(sumGross)}</span></div>
        <div class="tr2"><span>(&#8211;) Discount</span><span style="font-family:monospace">&#8377; ${fmtN(sumDisc)}</span></div>
        <div class="tr2"><span>Taxable Amount</span><span style="font-family:monospace">&#8377; ${fmtN(sumTaxable)}</span></div>
        <div class="tr2"><span>CGST</span><span style="font-family:monospace">&#8377; ${fmtN(sumCGST)}</span></div>
        <div class="tr2"><span>SGST</span><span style="font-family:monospace">&#8377; ${fmtN(sumSGST)}</span></div>
        <div class="tr2"><span>Total Tax</span><span style="font-family:monospace">&#8377; ${fmtN(totalTax)}</span></div>
        <div class="tr2"><span>Round Off</span><span style="font-family:monospace">${roundOff >= 0 ? "+" : ""}${fmtN(roundOff)}</span></div>
        <div class="tr2 grand"><span>Grand Total</span><span>&#8377; ${fmtN(grand)}</span></div>
      </div>
    </div>
  </div>

  <div class="inv-words">
    <b>Amount in Words</b>${amtInWords(grand)}
  </div>

  <div class="inv-terms">
    <h4>Terms &amp; Conditions</h4>
    <ol>
      <li>Goods once sold will not be taken back or exchanged.</li>
      <li>Interest @ 2% p.m. will be charged on overdue payments.</li>
      <li>All disputes are subject to local jurisdiction only.</li>
      <li>E. &amp; O.E. (Errors and Omissions Excepted).</li>
      <li>This is a computer-generated invoice and does not require a physical signature.</li>
    </ol>
  </div>

  <div class="inv-foot">
    <div class="ifb">
      <div class="sa"></div>
      <div class="sl">Customer Signature &amp; Stamp</div>
    </div>
    <div class="ifb">
      <div class="sa" style="display:flex;align-items:flex-end;justify-content:center;padding-bottom:4px">
        <div style="font-size:10px;color:var(--muted)">We declare this invoice is true &amp; correct.</div>
      </div>
      <div class="sl">Declaration</div>
    </div>
    <div class="ifb">
      <div class="sa"></div>
      <div class="sn">${name}</div>
      ${sigName ? `<div class="sl">${sigName}${sigDesig ? ` (${sigDesig})` : ""}</div>` : ""}
      <div class="sl">Authorised Signatory</div>
    </div>
  </div>

</div>

<div class="inv-stamp">
  GSTIN: ${gst} &nbsp;|&nbsp; PAN: ${pan} &nbsp;|&nbsp; ${email} &nbsp;|&nbsp; Computer Generated Invoice &nbsp;|&nbsp; FY ${fyLabel}
</div>

</body>
</html>`;
}