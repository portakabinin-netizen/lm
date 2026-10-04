
export const generateLedgerHTML = (ledgerData: any, ledgerRows: any[], user: any) => {
  const corporateName = user?.corporateName || "Our Company";
  const logoUrl = user?.CorpProfileImage || "https://img.icons8.com/?size=100&id=E6RfmLvxU30R&format=png&color=000000";
  const reportDate = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

  const rowsHtml = ledgerRows.map(item => {
    const isPayment = item.paymentType === "Dr";
    const d = item.voucherDate ? new Date(item.voucherDate) : null;
    const dateStr = d ? `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}` : '';
    
    return `
      <tr>
        <td style="width: 60px;">${dateStr}</td>
        <td>
          <div style="font-weight: bold; color: #1e293b;">${item.paymentFromTo || 'General'}</div>
          <div style="font-size: 10px; color: #64748b;">${item.voucherNarration || ''}</div>
        </td>
        <td style="text-align: right; width: 80px;" class="${isPayment ? 'amt-dr' : ''}">
          ${isPayment ? '₹' + item.amt.toLocaleString() : ''}
        </td>
        <td style="text-align: right; width: 80px;" class="${!isPayment ? 'amt-cr' : ''}">
          ${!isPayment ? '₹' + item.amt.toLocaleString() : ''}
        </td>
        <td style="text-align: right; width: 90px; font-weight: bold; color: ${item.runningBalance >= 0 ? '#16a34a' : '#dc2626'}">
          ₹${item.runningBalance.toLocaleString()}
        </td>
      </tr>
    `;
  }).join('');

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, minimum-scale=1.0, user-scalable=no" />
        <style>
          body { font-family: 'Helvetica', 'Arial', sans-serif; padding: 20px; color: #1e293b; line-height: 1.4; }
          .header { display: flex; align-items: center; justify-content: space-between; border-bottom: 2px solid #1e3a8a; padding-bottom: 15px; margin-bottom: 25px; }
          .logo { width: 50px; height: 50px; border-radius: 10px; object-fit: contain; }
          .company-info { text-align: right; flex: 1; }
          .company-name { font-size: 20px; font-weight: 800; color: #1e3a8a; margin-bottom: 2px; }
          .ledger-title { font-size: 26px; font-weight: 900; color: #334155; margin-bottom: 4px; }
          
          .lead-info { background: #f8fafc; padding: 15px; border-radius: 12px; margin-bottom: 25px; border: 1px solid #e2e8f0; display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
          .info-block { font-size: 13px; }
          .info-label { color: #64748b; font-weight: 600; text-transform: uppercase; font-size: 10px; letter-spacing: 0.5px; margin-bottom: 2px; }
          .info-value { font-weight: 700; color: #1e293b; }

          table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
          th { background: #f1f5f9; color: #475569; text-align: left; padding: 12px 8px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid #e2e8f0; }
          td { padding: 10px 8px; border-bottom: 1px solid #f1f5f9; font-size: 12px; vertical-align: top; }
          .amt-dr { color: #dc2626; }
          .amt-cr { color: #16a34a; }
          
          .summary-card { background: #f8fafc; padding: 20px; border-radius: 16px; border: 1px solid #e2e8f0; margin-top: 20px; }
          .summary-row { display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 14px; color: #475569; }
          .summary-total { display: flex; justify-content: space-between; margin-top: 15px; padding-top: 15px; border-top: 2px solid #e2e8f0; }
          .total-label { font-size: 16px; font-weight: 800; color: #1e293b; }
          .total-value { font-size: 20px; font-weight: 900; }
          
          .footer { text-align: center; margin-top: 40px; font-size: 10px; color: #94a3b8; border-top: 1px solid #f1f5f9; padding-top: 20px; }
        </style>
      </head>
      <body>
        <div class="header">
          <div style="flex: 2;">
            <div class="ledger-title">Financial Ledger</div>
            <div style="font-size: 12px; color: #64748b; font-weight: 500;">Period: Up to ${reportDate}</div>
          </div>
          <div class="company-info">
            <img src="${logoUrl}" class="logo" />
            <div class="company-name">${corporateName}</div>
          </div>
        </div>

        <div class="lead-info">
          <div class="info-block">
            <div class="info-label">Client Name</div>
            <div class="info-value">${ledgerData.sender_name}</div>
          </div>
          <div class="info-block">
            <div class="info-label">Lead Number</div>
            <div class="info-value">#${ledgerData.lead_no}</div>
          </div>
          <div class="info-block">
            <div class="info-label">Project / Product</div>
            <div class="info-value">${ledgerData.product_name}</div>
          </div>
          <div class="info-block">
            <div class="info-label">Current Status</div>
            <div class="info-value" style="color: #1e3a8a;">${ledgerData.status}</div>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Narration</th>
              <th style="text-align: right;">Paid (-)</th>
              <th style="text-align: right;">Received (+)</th>
              <th style="text-align: right;">Balance</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>

        <div class="summary-card">
          <div class="summary-row">
            <span>Total Client Receipts</span>
            <span style="color: #16a34a; font-weight: 700;">₹${ledgerData.totalRevenue?.toLocaleString()}</span>
          </div>
          <div class="summary-row">
            <span>Total Project Costs</span>
            <span style="color: #dc2626; font-weight: 700;">₹${ledgerData.totalCost?.toLocaleString()}</span>
          </div>
          <div class="summary-total">
            <span class="total-label">NET MARGIN (P&L)</span>
            <span class="total-value" style="color: ${ledgerData.grossMargin >= 0 ? '#16a34a' : '#dc2626'}">
              ${ledgerData.grossMargin >= 0 ? '+' : ''}₹${ledgerData.grossMargin?.toLocaleString()}
            </span>
          </div>
        </div>

        <div class="footer">
          This is a computer-generated statement and does not require a physical signature.
          <br/>© ${new Date().getFullYear()} ${corporateName}. All rights reserved.
        </div>
      </body>
    </html>
  `;
};
