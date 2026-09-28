import { ExternalLink, FileText, Play } from 'lucide-react';
import { useUser } from '../context/AuthContext';
import { cn, formatBytes } from '../lib/format';
import { fileHref, isImage, isVideo } from '../lib/files';
import type { DriveFile } from '../types';

/** Secondary "Open in Drive" link — admins only (clients and most employees can't open Drive links). */
export function DriveLink({ file, className }: { file: DriveFile; className?: string }) {
  const user = useUser();
  if (user.role !== 'admin' || !file.webViewLink || !file.contentUrl) return null;
  return (
    <a
      href={file.webViewLink}
      target="_blank"
      rel="noreferrer"
      onClick={(e) => e.stopPropagation()}
      className={cn('inline-flex items-center gap-1 text-[11px] font-medium text-slate-400 hover:text-brand-600', className)}
      title="Open in Google Drive"
    >
      <ExternalLink className="size-3" /> Drive
    </a>
  );
}

/** Read-only gallery: image thumbnails, inline video players and chips for everything else. */
export function FilePreviewGrid({ files, className }: { files: DriveFile[]; className?: string }) {
  if (!files.length) return <p className="text-sm text-slate-400">No files</p>;
  const media = files.filter((f) => (isImage(f) || isVideo(f)) && fileHref(f));
  const other = files.filter((f) => !media.includes(f));
  return (
    <div className={cn('space-y-2', className)}>
      {media.length > 0 && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {media.map((f) => (
            <MediaTile key={f.id} file={f} />
          ))}
        </div>
      )}
      {other.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {other.map((f) => (
            <FileLinkChip key={f.id} file={f} />
          ))}
        </div>
      )}
    </div>
  );
}

function MediaTile({ file }: { file: DriveFile }) {
  const href = fileHref(file)!;
  const video = isVideo(file);
  return (
    <figure className={cn('overflow-hidden rounded-xl border border-slate-200 bg-slate-50', video && 'col-span-2')}>
      {video ? (
        <video controls preload="metadata" src={href} className="aspect-video w-full bg-slate-900" aria-label={file.name} />
      ) : (
        <a href={href} target="_blank" rel="noreferrer" className="block">
          <img src={href} alt={file.name} loading="lazy" className="aspect-[4/3] w-full object-cover transition hover:opacity-90" />
        </a>
      )}
      <figcaption className="flex items-center gap-2 px-2 py-1.5 text-[11px] text-slate-500">
        {video && <Play className="size-3 shrink-0" />}
        <a href={href} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate hover:text-brand-600" title={file.name}>
          {file.name}
        </a>
        <DriveLink file={file} />
      </figcaption>
    </figure>
  );
}

export function FileLinkChip({ file }: { file: DriveFile }) {
  const href = fileHref(file);
  const content = (
    <>
      <FileText className="size-3.5 shrink-0" />
      <span className="max-w-[12rem] truncate">{file.name}</span>
      {!!file.size && <span className="text-slate-400">{formatBytes(file.size)}</span>}
    </>
  );
  return (
    <span className="inline-flex items-center gap-1.5">
      {href ? (
        <a href={href} target="_blank" rel="noreferrer" className="chip bg-white py-1 text-slate-700 ring-1 ring-slate-200 hover:ring-brand-300">
          {content}
        </a>
      ) : (
        <span className="chip bg-white py-1 text-slate-700 ring-1 ring-slate-200">{content}</span>
      )}
      <DriveLink file={file} />
    </span>
  );
}
