import { useRef, useState } from 'react';
import { FileText, Paperclip, X } from 'lucide-react';
import { uploadFile } from '../api/upload';
import { errorMessage } from '../api/client';
import { useToast } from '../context/ToastContext';
import { formatBytes } from '../lib/format';
import type { DriveFile } from '../types';

interface Props {
  projectId: string;
  taskId?: string;
  files: DriveFile[];
  onChange: (files: DriveFile[]) => void;
}

/** Optional attachments for comments / revision requests. Files upload immediately to Drive. */
export function AttachmentPicker({ projectId, taskId, files, onChange }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const toast = useToast();

  const pick = async (list: FileList | null) => {
    if (!list?.length) return;
    let current = files;
    for (const file of Array.from(list)) {
      try {
        setProgress(0);
        const saved = await uploadFile({ projectId, taskId, file, onProgress: setProgress });
        current = [...current, saved];
        onChange(current);
      } catch (e) {
        toast(errorMessage(e), 'error');
      } finally {
        setProgress(null);
      }
    }
    if (input.current) input.current.value = '';
  };

  return (
    <div className="space-y-2">
      {files.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {files.map((f) => (
            <li key={f.id} className="chip bg-slate-100 py-1 text-slate-700">
              <FileText className="size-3.5" />
              <span className="max-w-[10rem] truncate">{f.name}</span>
              <button type="button" onClick={() => onChange(files.filter((x) => x.id !== f.id))} aria-label={`Remove ${f.name}`}>
                <X className="size-3.5 text-slate-400 hover:text-slate-700" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {progress !== null ? (
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full bg-brand-500 transition-[width]" style={{ width: `${Math.round(progress * 100)}%` }} />
          </div>
          {Math.round(progress * 100)}%
        </div>
      ) : (
        <button type="button" onClick={() => input.current?.click()} className="btn-ghost !px-2 !py-1 text-xs">
          <Paperclip className="size-3.5" /> Attach file (optional)
        </button>
      )}
      <input ref={input} type="file" multiple hidden onChange={(e) => pick(e.target.files)} />
    </div>
  );
}

export function FileChip({ file }: { file: DriveFile }) {
  const content = (
    <>
      <FileText className="size-3.5 shrink-0" />
      <span className="max-w-[12rem] truncate">{file.name}</span>
      {!!file.size && <span className="text-slate-400">{formatBytes(file.size)}</span>}
    </>
  );
  return file.webViewLink ? (
    <a href={file.webViewLink} target="_blank" rel="noreferrer" className="chip bg-white py-1 text-slate-700 ring-1 ring-slate-200 hover:ring-brand-300">
      {content}
    </a>
  ) : (
    <span className="chip bg-white py-1 text-slate-700 ring-1 ring-slate-200">{content}</span>
  );
}
