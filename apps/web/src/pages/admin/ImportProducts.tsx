// Load the shop's real catalogue from a spreadsheet: choose a CSV, check the preview, then confirm.
import { useRef, useState } from 'react';
import { Download, FileSpreadsheet, Upload } from 'lucide-react';
import { apiUpload } from '../../lib/api';
import { Badge, Button } from '../../components/ui';
import { useAdminMutation, type ImportResult } from './adminApi';

const TEMPLATE = [
  'name,category,price,unit,stock,description,available',
  'Beef Mince,Beef,99.99,kg,18,Fresh beef mince for everyday cooking,yes',
  '"Russians, smoked",Braai,12.99,each,40,Smoked Russian sausages,yes',
].join('\r\n') + '\r\n';

function downloadTemplate() {
  const url = URL.createObjectURL(new Blob(['﻿' + TEMPLATE], { type: 'text/csv;charset=utf-8' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: 'green-valley-products-template.csv' });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const send = (file: File, dryRun: boolean) => { const fd = new FormData(); fd.append('file', file); return apiUpload<ImportResult>(`/admin/products/import${dryRun ? '?dryRun=1' : ''}`, fd); };

export function ImportProducts() {
  const input = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const preview = useAdminMutation((f: File) => send(f, true));
  const apply = useAdminMutation((f: File) => send(f, false));
  const choose = (f: File) => { setFile(f); apply.reset(); preview.mutate(f); };
  const p = preview.data;
  const ready = p && p.summary.errors === 0 && p.summary.create + p.summary.update > 0;

  return (
    <section className="card mb-4 p-4" aria-labelledby="import-h">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="import-h" className="flex items-center gap-2 font-extrabold"><FileSpreadsheet className="size-5 text-ink-3" aria-hidden /> Import from a spreadsheet</h2>
        <Button size="sm" variant="secondary" onClick={() => setOpen(o => !o)} aria-expanded={open}>{open ? 'Hide' : 'Import products'}</Button>
      </div>
      {open && (
        <div className="mt-3 space-y-3">
          <p className="text-sm text-ink-2">
            Save your price list as CSV (Excel: File › Save As › CSV). Required columns: <span className="font-semibold">name, category, price</span>.
            Optional: unit (kg or each), stock, description, available (yes/no). A product with the same name is updated; new names are added.
            Nothing changes until you confirm.
          </p>
          <div className="flex flex-wrap gap-2">
            <input ref={input} type="file" accept=".csv,text/csv" className="sr-only" tabIndex={-1} aria-hidden onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) choose(f); }} />
            <Button onClick={() => input.current?.click()} busy={preview.isPending}><Upload className="size-4" aria-hidden /> Choose CSV file</Button>
            <Button variant="ghost" onClick={downloadTemplate}><Download className="size-4" aria-hidden /> Download template</Button>
          </div>
          {preview.isError && <p className="text-sm font-semibold text-danger-text" role="alert">{preview.error.message}</p>}
          {p && !apply.data && (
            <div className="space-y-3" role="status">
              <p className="font-semibold">
                {file?.name}: {p.summary.create} new, {p.summary.update} to update
                {p.summary.errors > 0 && <span className="text-danger-text">, {p.summary.errors} with errors. Fix them in the spreadsheet and choose the file again.</span>}
              </p>
              <div className="max-h-96 overflow-auto rounded-xl border border-line">
                <table className="w-full min-w-[36rem] text-left text-sm">
                  <thead className="sticky top-0 bg-surface text-ink-3"><tr><th className="p-2 font-semibold">Row</th><th className="p-2 font-semibold">Product</th><th className="p-2 font-semibold">Result</th><th className="p-2 font-semibold">Details</th></tr></thead>
                  <tbody className="divide-y divide-line">
                    {p.results.map(r => (
                      <tr key={r.row}>
                        <td className="p-2 tabular-nums text-ink-3">{r.row}</td>
                        <td className="p-2 font-semibold">{r.name || '—'}</td>
                        <td className="p-2"><Badge tone={r.action === 'error' ? 'danger' : r.action === 'create' ? 'brand' : 'neutral'}>{r.action === 'error' ? 'Error' : r.action === 'create' ? 'New' : 'Update'}</Badge></td>
                        <td className={`p-2 ${r.action === 'error' ? 'text-danger-text' : 'text-ink-2'}`}>{(r.action === 'error' ? r.errors : r.changes ?? []).join('; ')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                <Button variant="ghost" onClick={() => { preview.reset(); setFile(null); }}>Cancel</Button>
                <Button disabled={!ready} busy={apply.isPending} onClick={() => file && apply.mutate(file)}>Import {p.summary.create + p.summary.update} products</Button>
              </div>
              {apply.isError && <p className="text-sm font-semibold text-danger-text" role="alert">{apply.error.message}</p>}
            </div>
          )}
          {apply.data && <p className="rounded-xl bg-ok-bg p-3 text-sm font-semibold text-ok-text" role="status">Imported: {apply.data.summary.create} added, {apply.data.summary.update} updated.</p>}
        </div>
      )}
    </section>
  );
}
