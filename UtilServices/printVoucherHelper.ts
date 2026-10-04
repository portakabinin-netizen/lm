import * as Print from 'expo-print';
import { shareAsync } from 'expo-sharing';
import { Platform } from 'react-native';

export interface VoucherEntry {
  accountName: string;
  type: 'Dr' | 'Cr';
  amount: number;
}

export interface VoucherPrintData {
  voucherNo: string;
  date: string;
  type: string;
  narration: string;
  totalAmount: number;
  entries: VoucherEntry[];
}

export interface CompanyPrintData {
  name: string;
  address?: string;
  gstNo?: string;
}

/**
 * Generates an HTML string for the accounting voucher and invokes expo-print.
 */
export const printAccountingVoucher = async (
  voucher: VoucherPrintData,
  company: CompanyPrintData
) => {
  // Build the rows for the Dr/Cr table
  let tableRows = '';
  voucher.entries.forEach((entry, index) => {
    const isDr = entry.type === 'Dr';
    // Format amounts with commas for Indian Rupees
    const amountStr = entry.amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    
    tableRows += `
      <tr>
        <td style="text-align: center;">${index + 1}</td>
        <td style="padding-left: ${isDr ? '10px' : '40px'}; font-weight: ${isDr ? 'bold' : 'normal'};">
          ${isDr ? '' : 'To '}${entry.accountName} ${isDr ? 'A/c' : ''}
        </td>
        <td style="text-align: right;">${isDr ? amountStr : ''}</td>
        <td style="text-align: right;">${!isDr ? amountStr : ''}</td>
      </tr>
    `;
  });

  const totalStr = voucher.totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const htmlContent = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Voucher Print</title>
      <style>
        @page { margin: 20mm; size: A5 landscape; }
        body {
          font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
          color: #333;
          font-size: 14px;
          line-height: 1.5;
          margin: 0;
          padding: 0;
        }
        .container {
          width: 100%;
          max-width: 800px;
          margin: 0 auto;
          border: 1px solid #ccc;
          padding: 20px;
          box-sizing: border-box;
        }
        .header {
          text-align: center;
          border-bottom: 2px solid #333;
          padding-bottom: 15px;
          margin-bottom: 20px;
        }
        .company-name {
          font-size: 24px;
          font-weight: bold;
          margin: 0 0 5px 0;
          text-transform: uppercase;
        }
        .company-details {
          font-size: 12px;
          color: #555;
          margin: 0;
        }
        .voucher-title {
          font-size: 18px;
          font-weight: bold;
          margin-top: 15px;
          text-decoration: underline;
          text-transform: uppercase;
        }
        .info-row {
          display: flex;
          justify-content: space-between;
          margin-bottom: 15px;
        }
        .info-col {
          display: flex;
          flex-direction: column;
        }
        .info-label {
          font-size: 12px;
          color: #666;
          font-weight: bold;
        }
        .info-value {
          font-size: 14px;
          font-weight: bold;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 20px;
        }
        th, td {
          border: 1px solid #aaa;
          padding: 10px;
          text-align: left;
        }
        th {
          background-color: #f5f5f5;
          font-weight: bold;
          text-align: center;
          font-size: 13px;
        }
        .total-row td {
          font-weight: bold;
          background-color: #fafafa;
        }
        .narration-box {
          border: 1px solid #aaa;
          padding: 15px;
          margin-bottom: 40px;
          min-height: 50px;
        }
        .narration-label {
          font-size: 12px;
          font-weight: bold;
          margin-bottom: 5px;
        }
        .signatures {
          display: flex;
          justify-content: space-between;
          margin-top: 50px;
        }
        .sig-block {
          text-align: center;
          width: 30%;
        }
        .sig-line {
          border-top: 1px solid #333;
          padding-top: 5px;
          font-size: 12px;
          font-weight: bold;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <!-- Header -->
        <div class="header">
          <h1 class="company-name">${company.name}</h1>
          ${company.address ? `<p class="company-details">${company.address}</p>` : ''}
          ${company.gstNo ? `<p class="company-details">GSTIN: ${company.gstNo}</p>` : ''}
          <div class="voucher-title">${voucher.type} Voucher</div>
        </div>

        <!-- Voucher Info -->
        <div class="info-row">
          <div class="info-col">
            <span class="info-label">Voucher No.</span>
            <span class="info-value">${voucher.voucherNo || 'N/A'}</span>
          </div>
          <div class="info-col" style="text-align: right;">
            <span class="info-label">Date</span>
            <span class="info-value">${voucher.date}</span>
          </div>
        </div>

        <!-- Entries Table -->
        <table>
          <thead>
            <tr>
              <th style="width: 5%;">S.No</th>
              <th style="width: 55%;">Particulars</th>
              <th style="width: 20%;">Debit (₹)</th>
              <th style="width: 20%;">Credit (₹)</th>
            </tr>
          </thead>
          <tbody>
            ${tableRows}
            <tr class="total-row">
              <td colspan="2" style="text-align: right;">Total</td>
              <td style="text-align: right;">${totalStr}</td>
              <td style="text-align: right;">${totalStr}</td>
            </tr>
          </tbody>
        </table>

        <!-- Narration -->
        <div class="narration-box">
          <div class="narration-label">Narration / Remarks:</div>
          <div>${voucher.narration || ''}</div>
        </div>

        <!-- Signatures -->
        <div class="signatures">
          <div class="sig-block">
            <div class="sig-line">Prepared By</div>
          </div>
          <div class="sig-block">
            <div class="sig-line">Checked By</div>
          </div>
          <div class="sig-block">
            <div class="sig-line">Authorized Signatory</div>
          </div>
        </div>
      </div>
    </body>
    </html>
  `;

  try {
    const { uri } = await Print.printToFileAsync({
      html: htmlContent,
      base64: false,
    });
    
    if (Platform.OS === 'ios') {
      await shareAsync(uri, { UTI: '.pdf', mimeType: 'application/pdf' });
    } else {
      await Print.printAsync({ uri });
    }
  } catch (error) {
    console.error('Failed to print voucher:', error);
    throw error;
  }
};
