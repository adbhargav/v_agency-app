import { useState } from 'react';
import { BadgeCheck, Download, ExternalLink, Search } from 'lucide-react';
import { useApprovedFiles } from '../../api/hooks';
import { isNotConfigured } from '../../api/client';
import { formatBytes, formatDate } from '../../lib/format';
import { FileThumb } from '../../components/FileManager';
import { DriveLink } from '../../components/FilePreview';
import { downloadHref, fileHref } from '../../lib/files';
import { EmptyState, ErrorState, PageHeader, Skeleton } from '../../components/ui';
import type { DriveFile } from '../../types';

export function AssetCard({ file }: { file: DriveFile }) {
  const href = fileHref(file);
  const download = file.contentUrl ? downloadHref(file) : null;
  return (
    <div className="card group relative flex items-center gap-3 p-3 transition hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-md">
      <FileThumb file={file} className="size-11" />
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1 truncate text-sm font-medium text-slate-800">
          <span className="truncate">{file.name}</span>
          <BadgeCheck className="size-3.5 shrink-0 text-emerald-500" />
        </p>
        <p className="flex items-center gap-2 text-xs text-slate-400">
          {formatBytes(file.size)} · {formatDate(file.createdAt)}
          <DriveLink file={file} className="relative z-10" />
        </p>
      </div>
      {download && (
        <a href={download} className="relative z-10 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-brand-600" aria-label={`Download ${file.name}`} title="Download">
          <Download className="size-4" />
        </a>
      )}
      {href && (
        <a href={href} target="_blank" rel="noreferrer" className="after:absolute after:inset-0 after:content-['']" aria-label={`Open ${file.name}`}>
          <ExternalLink className="size-4 text-slate-300 group-hover:text-brand-500" />
        </a>
      )}
    </div>
  );
}

export default function ApprovedAssetsPage() {
  const { data: files, isLoading, error, refetch } = useApprovedFiles();
  const [q, setQ] = useState('');
  const list = (files ?? []).filter((f) => f.name.toLowerCase().includes(q.toLowerCase()));

  return (
    <div>
      <PageHeader title="Approved Assets" subtitle="Your final deliverables, ready to use" />
      <div className="relative mb-4 sm:max-w-xs">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
        <input className="input !pl-9" placeholder="Search assets…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {error && (isNotConfigured(error) ? <EmptyState title="Asset library unavailable" description="File storage isn't connected yet. Please check back soon." /> : <ErrorState error={error} onRetry={() => refetch()} />)}
      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-16 rounded-2xl" />
          ))}
        </div>
      ) : !error && list.length === 0 ? (
        <EmptyState icon={<Download className="size-5" />} title="No approved assets yet" description="Final deliverables appear here once approved." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((f) => (
            <AssetCard key={f.id} file={f} />
          ))}
        </div>
      )}
    </div>
  );
}
