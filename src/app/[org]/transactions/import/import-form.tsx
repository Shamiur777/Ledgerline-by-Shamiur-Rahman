"use client";

import { useActionState } from "react";
import { Button, Card, ErrorNote } from "@/components/ui";
import { importTransactions, type ImportState } from "./actions";

export function ImportForm({ slug }: { slug: string }) {
  const [state, action, pending] = useActionState<ImportState, FormData>(importTransactions.bind(null, slug), undefined);
  return (
    <form action={action} className="space-y-4">
      <input type="file" name="file" accept=".csv,text/csv" required className="block text-sm" aria-label="CSV file" />
      <div className="flex gap-2">
        <Button type="submit" name="intent" value="check" variant="secondary" disabled={pending}>Check file</Button>
        <Button type="submit" name="intent" value="import" disabled={pending}>Import</Button>
      </div>
      <ErrorNote message={state?.error} />
      {state?.imported != null && <p className="text-sm text-income">Imported {state.imported} transactions.</p>}
      {state?.checked && (
        <Card className="p-4 text-sm">
          <p><strong>{state.checked.valid}</strong> valid row(s), <strong>{state.checked.errors.length}</strong> problem(s).</p>
          {state.checked.errors.length > 0 && (
            <ul className="mt-2 max-h-64 list-disc space-y-1 overflow-auto pl-5 text-expense">
              {state.checked.errors.slice(0, 100).map((e, i) => <li key={i}>Line {e.line}: {e.message}</li>)}
            </ul>
          )}
        </Card>
      )}
    </form>
  );
}
