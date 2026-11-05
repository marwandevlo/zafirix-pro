# Root-cause audit — real-estate draft exported 2026-11-05

Read-only recomputation of the stored draft (revision 79, sector `real_estate`, project type `existing`, horizon 7 years from 2026-11, fiscal year opening in December). The stored study was not edited. Identity fields are omitted from this note.

The books reconcile (`checks.ok`, zero reconciliation errors). The large revenue and the negative value are the arithmetic result of the saved assumptions. No forecast was rewritten to look profitable.

## Confirmed defects (fixed on this branch)

| Topic | Class | Evidence | Change |
| --- | --- | --- | --- |
| DSCR about −14.57 in 2026/27 with no loan | ENGINE_BUG | Debt service included overdraft interest. Stored overdraft rate 15 %, loan principal 0. 2026/27 contractual service is now 0 and DSCR is empty, with the reason that overdraft interest is not a bank DSCR. Overdraft interest stays in the income statement and in cash. | `metrics.ts` |
| Churn, ARPU, LTV on a real-estate study | ENGINE_BUG / REPORT_RENDERING | SaaS indicators were attached whenever a product kind was `subscription`. | SaaS indicators only when the sector is `saas`. |
| Rent amount dropped | ENGINE_BUG (silent) | Expense behaviour `variable_revenue_pct`, monthly amount 76,987, percent of revenue 0. The engine uses the percent, so the amount contributes 0. | Warning only. The amount is not inserted into the calculation. The report shows “montant mensuel non retenu”. |
| “Below the desired cash minimum” when no minimum was set | REPORT_RENDERING | The engine warned whenever cash was below `minimumCash`, including when that floor was 0. | The warning is emitted only when a positive floor was entered. Negative cash remains a separate finding. |
| Eight fiscal years in one portrait table | REPORT_RENDERING | November start plus a December year-open produces 8 columns (2025/26* through 2032/33*). | Tables wider than 7 columns are split into balanced groups. Header repeats. Minimum table type is 7.5 pt. |
| Investment of 2,000,000 labelled as if it were the empty investment line | REPORT_RENDERING | `investments[0].amountHT` is 0. The 2,000,000 is the lease purchase option at month 36. | Cover says “option d’achat de crédit-bail” when that is the whole booked capex. The lease row names the option. |
| Need of 1,116,579,148 versus minimum cash of −1,520,413,280 | REPORT_RENDERING | Both figures reconcile. The need is the trough before equity, loans and grants, with overdraft interest added back. Minimum cash is the actual net balance, overdraft interest included. | Labels and the funding finding state the two definitions. They are not merged. |

## Customer inputs (not corrected)

| Topic | Class | Stored value | What the engine does |
| --- | --- | --- | --- |
| Real estate billed as a subscription | CUSTOMER_INPUT | Product kind `subscription`. The real-estate template for a new study is a one-time sale, not a subscription. Import creates a one-time line. The subscription, churn, capacity and growth were saved later. | Each month adds `volumeMonth1` new subscribers, grown once per completed year. Each remaining subscriber is billed the unit price that month, after monthly churn. |
| Revenue 107,131,049 in 2026/27 and 760,731,838 in 2031/32 | CUSTOMER_INPUT | Price 2,000,000, price growth 15 % per year, unit cost 2,000,000, cost growth 20 %, volume 1, volume growth 20 %, monthly churn 15 %, capacity 2,000,000 (does not bind). | Reproduced to the dirham. 2025/26* is the single month of November 2026 and is exactly 2,000,000. Price growth of 15 %, not a monthly application of the annual rate, is what moves the first full year from about 105.3 million to 107,131,049. |
| External charges 2,000,000 growing at 15 % | CUSTOMER_INPUT | Behaviour `fixed`, included. | Included. Not a defect. |
| Bank financing in the project text, loan amount 0, subsidy 2,000,000 | IMPORT_MAPPING + CUSTOMER_INPUT | Import stores the sentence in the project objectives and does not create a loan. Principal stayed 0. Equity 500,000 at month 0. Grant 2,000,000 at month 0, investment grant, amortised over 7 years. | No loan schedule. The sentence was not turned into a loan. |
| Subsidy in 2025/26*, option exercised in 2028/29 | CUSTOMER_INPUT | Month 0 is November 2026. The fiscal year opens in December, so November 2026 is the one-month stub 2025/26*. The lease starts at month 0 for 36 months, so the option falls in November 2029, labelled 2028/29. | Calendar is consistent. A warning notes that the grant and the option are more than a year apart. |
| Lower volume improves NPV | CUSTOMER_INPUT | Unit cost equals price at the start, then the cost grows at 20 % and the price at 15 %. Unit margin is zero, then negative. | Fewer loss-making units reduce the loss, so NPV rises. The sign is not inverted. |
| Cotisation minimale while the accounting result stays negative | TAX_RULE | Exemption flag is on. Income tax is 0 through 2028/29, then 998,881 in 2029/30 on revenue of 399,266,488, while net income stays negative. | Existing minimum-contribution rule. The rate was not changed. Whether this activity’s legal base differs is unconfirmed. |
| VAT on property development | UNCONFIRMED | Standard rate on the product and on charges that carry a VAT rate. No property-development regime is selected. | A warning says so. VAT accounting was not modified. A structural VAT-credit warning already exists. |
| No payroll, no construction budget, no sales phases, no local taxes | CUSTOMER_INPUT | Staff list empty. Investment amount 0. Local-tax list empty. | Nothing was estimated. A new real-estate study now starts from lot sales, a construction cost line, local charges, a site manager and a sales role, all at zero until the user fills them. |
| Partial-year labels | REPORT_RENDERING, calendar confirmed | 2025/26* = 1 month, 2026/27 through 2031/32 = 12 months, 2032/33* = 11 months. | Footnote now states that the year opens in month 12 and that the star is not a calendar year. |

## Before / after on the stored assumptions

Revenue, net income, NPV (−743,718,198), peak funding need (1,116,579,148) and minimum cash (−1,520,413,280) are unchanged, because the subscription formula, the tax rates and the VAT rules were not changed.

| Figure | Before | After |
| --- | --- | --- |
| 2026/27 revenue | 107,131,049 MAD | 107,131,049 MAD |
| 2031/32 revenue | 760,731,838 MAD | 760,731,838 MAD |
| 2026/27 DSCR | about −14.57, debt service equal to overdraft interest | empty: no contractual loan |
| SaaS block | present | absent on this sector |
| Displayed statements | whole dirhams in PDF, two decimals in Excel | whole dirhams in PDF, Word and Excel. The engine still keeps centimes. 107,131,048.53 displays as 107,131,049. |

## Verification

`npx tsx --test tests/business-studio/*.test.ts` — 85 passed, 0 failed. The new file locks the two revenue years, the later minimum tax of 998,881, a null DSCR without a loan, a finite DSCR with a loan, SaaS metrics only for the SaaS sector, and the same revenue in the PDF text, the Word document and the workbook. French and Arabic PDFs of the numeric clone were reopened. Representative pages show the navy and gold cover, the draft banner, the lease-option label, the executive figures, a right-to-left Arabic cover and summary, and a footer with page numbers. Full-report length for this clone is 27 French pages and 26 Arabic pages.
