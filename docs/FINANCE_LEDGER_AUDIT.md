# Read-only finance ledger audit

The SQL report in `scripts/audit-finance-ledgers.sql` checks historical irregular-expense links, generated expense rows without a matching payment, linked-pair consistency, debt balance reconciliation, obligation payment history, and bucket availability.

## Run against a remote D1 database

1. Confirm the target database name and credentials in the Cloudflare dashboard.
2. Take or confirm a recent backup/export before inspecting production data.
3. Run:

```sh
npx wrangler d1 execute <database-name> --remote --file=./scripts/audit-finance-ledgers.sql
```

Replace `<database-name>` with the actual D1 database name. Do not use `--local` when auditing production.

**Read-only guarantee:** the file contains only `SELECT` statements. It does not update, insert, delete, create, or migrate data.

## Interpreting results

- `no_matching_expense`: payment has no plausible generated expense row. Do not invent one without external evidence.
- `ambiguous_match`: one or more matching expense/payment candidates prevent a safe automatic link.
- `unexpected_unlinked_unique_pair`: a unique pair appears linkable but remains unlinked; investigate migration history before any repair.
- Generated expenses without a corresponding payment may be manually created or legacy inconsistencies; review individually.
- Debt balance differences are diagnostic only. A balance may have been manually corrected or imported; do not overwrite it from the implied value.
- Obligation totals are historical cash payments, not a comparison to the current scheduled amount.
- Bucket availability repeats the application formula: allocations minus expenses, debt payments, and obligation payments. Irregular payments are already represented by expenses and must not be subtracted again.

The report intentionally does not repair records. Preserve the original payment and expense rows until every discrepancy has a verified explanation.
