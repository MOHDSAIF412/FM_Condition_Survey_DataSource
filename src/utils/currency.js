/**
 * Money formatting for the survey.
 *
 * One place on purpose. Currency was previously a bare "$" written out at
 * seventeen separate call sites across the screens, the PDF and the Excel
 * export, which is exactly how a codebase ends up showing two different
 * currencies in the same report.
 */

export const CURRENCY_CODE = 'AED';

/** "AED 14,500" - for on-screen and PDF text. */
export function formatMoney(value) {
  const n = parseFloat(value) || 0;
  return `${CURRENCY_CODE} ${n.toLocaleString('en-AE', { maximumFractionDigits: 0 })}`;
}

/**
 * Excel number format. The cell keeps a real number so it still sorts and sums
 * in Excel; only its display carries the currency.
 */
export const EXCEL_MONEY_FORMAT = '"AED "#,##0';
