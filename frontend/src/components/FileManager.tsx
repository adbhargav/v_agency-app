import { useRef, useState, type DragEvent, type FormEvent } from 'react';
import {
  BadgeCheck,
  ChevronRight,
  CloudUpload,
  ExternalLink,
  FileImage,
  FileText,
  FileVideo,
  Folder as FolderIcon,
  FolderPlus,
  HardDrive,
  X,
} from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useCreateFolder, useFolderContents, useSetFileFinal } from '../api/hooks';
import { uploadFile } from '../api/upload';
import { errorMessage, isNotConfigured } from '../api/client';
import { useUser } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { cn, formatBytes, formatDate } from '../lib/format';
import { EmptyState, ErrorState, Field, Modal, Skeleton, Spinner, Toggle } from './ui';
import type { DriveFile } from '../types';

interface UploadItem {
  id: number;
  name: string;
  size: number;
  progress: number;
  status: 'uploading' | 'done' | 'error';
  error?: string;
  abort: AbortController;
}

let uploadSeq = 0;

export function FileIcon({ mime, className }: { mime: string; className?: string }) {
  const Icon = mime.startsWith('image/') ? FileImage : mime.startsWith('video/') ? FileVideo : FileText;
  const tone = mime.startsWith('image/') ? 'bg-pink-50 text-pink-600' : mime.startsWith('video/') ? 'bg-violet-50 text-violet-600' : 'bg-sky-50 text-sky-600';
  return (
    <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-xl', tone, className)}>
      <Icon className="size-4.5" />
    </span>
  );
}

export function FileManager({ projectId }: { projectId: string }) {
  const user = useUser();
  const isAdmin = user.role === 'admin';
  const [localTrail, setTrail] = useState<{ id: string; name: string }[]>([]);
  const current = localTrail[localTrail.length - 1] ?? null;
  const { data, isLoading, error, refetch } = useFolderContents(projectId, current?.id ?? null);
  // Prefer the server-provided breadcrumb (root → current); fall back to the locally tracked trail.
  const trail = data?.breadcrumb ?? localTrail;
  const setFinal = useSetFileFinal();
  const toast = useToast();
  const qc = useQueryClient();
  const [newFolder, setNewFolder] = useState(false);
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const notConfigured = isNotConfigured(error);

  const startUploads = (files: FileList | File[]) => {
    const folderId = current?.id ?? null;
    for (const file of Array.from(files)) {
      const item: UploadItem = { id: ++uploadSeq, name: file.name, size: file.size, progress: 0, status: 'uploading', abort: new AbortController() };
      setUploads((u) => [...u, item]);
      const update = (patch: Partial<UploadItem>) => setUploads((u) => u.map((x) => (x.id === item.id ? { ...x, ...patch } : x)));
      uploadFile({ projectId, folderId, file, signal: item.abort.signal, onProgress: (p) => update({ progress: p }) })
        .then(() => {
          update({ status: 'done', progress: 1 });
          qc.invalidateQueries({ queryKey: ['folders', projectId] });
          window.setTimeout(() => setUploads((u) => u.filter((x) => x.id !== item.id)), 2500);
        })
        .catch((e) => {
          update({ status: 'error', error: errorMessage(e) });
          if (isNotConfigured(e)) toast(errorMessage(e), 'error');
        });
    }
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length) startUploads(e.dataTransfer.files);
  };

  if (notConfigured) {
    return (
      <EmptyState
        icon={<HardDrive className="size-5" />}
        title="File manager is not available yet"
        description="Google Drive hasn't been connected on the server. Once an administrator configures Drive credentials, project files will appear here."
      />
    );
  }

  return (
    <div
      className="relative space-y-4"
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setDragOver(false);
      }}
      onDrop={onDrop}
    >
      <div className="flex flex-wrap items-center gap-2">
        <nav className="no-scrollbar flex min-w-0 flex-1 items-center gap-1 overflow-x-auto text-sm" aria-label="Breadcrumb">
          <button onClick={() => setTrail([])} className={cn('shrink-0 rounded-lg px-2 py-1 font-medium hover:bg-slate-100', !current ? 'text-slate-900' : 'text-slate-500')}>
            Project files
          </button>
          {trail.map((f, i) => (
            <span key={f.id} className="flex shrink-0 items-center gap-1">
              <ChevronRight className="size-4 text-slate-300" />
              <button
                onClick={() => setTrail(trail.slice(0, i + 1))}
                className={cn('rounded-lg px-2 py-1 font-medium hover:bg-slate-100', i === trail.length - 1 ? 'text-slate-900' : 'text-slate-500')}
              >
                {f.name}
              </button>
            </span>
          ))}
        </nav>
        <button className="btn-secondary" onClick={() => setNewFolder(true)}>
          <FolderPlus className="size-4" /> <span className="hidden sm:inline">New folder</span>
        </button>
        <button className="btn-primary" onClick={() => input.current?.click()}>
          <CloudUpload className="size-4" /> Upload
        </button>
        <input
          ref={input}
          type="file"
          multiple
          hidden
          onChange={(e) => {
            if (e.target.files?.length) startUploads(e.target.files);
            e.target.value = '';
          }}
        />
      </div>

      <button
        type="button"
        onClick={() => input.current?.click()}
        className={cn(
          'flex w-full flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed px-4 py-6 text-center text-sm transition',
          dragOver ? 'border-brand-400 bg-brand-50 text-brand-700' : 'border-slate-200 bg-white/60 text-slate-500 hover:border-brand-300',
        )}
      >
        <CloudUpload className="size-6" />
        <span className="font-medium">Drag & drop files here, or tap to browse</span>
        <span className="text-xs text-slate-400">Large files stream straight to the agency Google Drive</span>
      </button>

      {uploads.length > 0 && (
        <ul className="space-y-2">
          {uploads.map((u) => (
            <li key={u.id} className="card flex items-center gap-3 p-3">
              <CloudUpload className={cn('size-4 shrink-0', u.status === 'error' ? 'text-rose-500' : 'text-brand-500')} />
              <div className="min-w-0 flex-1">
                <div className="flex justify-between gap-2 text-xs">
                  <span className="truncate font-medium text-slate-700">{u.name}</span>
                  <span className="shrink-0 text-slate-500">
                    {u.status === 'error' ? 'Failed' : u.status === 'done' ? 'Done' : `${Math.round(u.progress * 100)}% · ${formatBytes(u.size)}`}
                  </span>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className={cn('h-full rounded-full transition-[width]', u.status === 'error' ? 'bg-rose-500' : u.status === 'done' ? 'bg-emerald-500' : 'bg-brand-500')}
                    style={{ width: `${Math.round(u.progress * 100)}%` }}
                  />
                </div>
                {u.error && <p className="mt-1 text-xs text-rose-600">{u.error}</p>}
              </div>
              <button
                aria-label="Dismiss upload"
                className="rounded p-1 text-slate-400 hover:text-slate-700"
                onClick={() => {
                  if (u.status === 'uploading') u.abort.abort();
                  setUploads((list) => list.filter((x) => x.id !== u.id));
                }}
              >
                <X className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {error && !notConfigured && <ErrorState error={error} onRetry={() => refetch()} />}

      {isLoading ? (
        <div className="grid gap-2 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16" />
          ))}
        </div>
      ) : data && data.folders.length + data.files.length === 0 ? (
        <EmptyState title="This folder is empty" description="Create a subfolder or drop files to upload." />
      ) : (
        data && (
          <div className="space-y-4">
            {data.folders.length > 0 && (
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {data.folders.map((f) => (
                  <button key={f.id} onClick={() => setTrail([...trail, f])} className="card flex items-center gap-3 p-3 text-left transition hover:border-brand-200 hover:shadow-md">
                    <span className="flex size-9 items-center justify-center rounded-xl bg-amber-50 text-amber-500">
                      <FolderIcon className="size-4.5" fill="currentColor" fillOpacity={0.2} />
                    </span>
                    <span className="truncate text-sm font-medium text-slate-800">{f.name}</span>
                    <ChevronRight className="ml-auto size-4 text-slate-300" />
                  </button>
                ))}
              </div>
            )}
            {data.files.length > 0 && (
              <ul className="card divide-y divide-slate-100">
                {data.files.map((f) => (
                  <FileRow
                    key={f.id}
                    file={f}
                    canToggle={isAdmin}
                    onToggle={(v) =>
                      setFinal.mutate(
                        { id: f.id, isFinal: v },
                        { onSuccess: () => toast(v ? 'Marked as approved asset' : 'Removed from approved assets'), onError: (e) => toast(errorMessage(e), 'error') },
                      )
                    }
                  />
                ))}
              </ul>
            )}
          </div>
        )
      )}

      {dragOver && <div className="pointer-events-none absolute inset-0 rounded-2xl ring-4 ring-brand-200" />}

      <NewFolderModal open={newFolder} onClose={() => setNewFolder(false)} projectId={projectId} parentId={current?.id ?? null} />
    </div>
  );
}

function FileRow({ file, canToggle, onToggle }: { file: DriveFile; canToggle: boolean; onToggle: (v: boolean) => void }) {
  return (
    <li className="flex items-center gap-3 px-3 py-2.5">
      <FileIcon mime={file.mimeType} />
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 truncate text-sm font-medium text-slate-800">
          <span className="truncate">{file.name}</span>
          {file.isFinal && <BadgeCheck className="size-4 shrink-0 text-emerald-500" aria-label="Approved asset" />}
        </p>
        <p className="truncate text-xs text-slate-400">
          {formatBytes(file.size)} · {formatDate(file.createdAt)}
          {file.uploadedBy ? ` · ${file.uploadedBy.name}` : ''}
        </p>
      </div>
      {canToggle && (
        <label className="hidden items-center gap-2 text-xs text-slate-500 sm:flex">
          Approved asset
          <Toggle checked={file.isFinal} onChange={onToggle} label="Approved asset" />
        </label>
      )}
      {canToggle && (
        <span className="sm:hidden">
          <Toggle checked={file.isFinal} onChange={onToggle} label="Approved asset" />
        </span>
      )}
      {file.webViewLink && (
        <a href={file.webViewLink} target="_blank" rel="noreferrer" className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-brand-600" aria-label={`Open ${file.name}`}>
          <ExternalLink className="size-4" />
        </a>
      )}
    </li>
  );
}

function NewFolderModal({ open, onClose, projectId, parentId }: { open: boolean; onClose: () => void; projectId: string; parentId: string | null }) {
  const [name, setName] = useState('');
  const create = useCreateFolder(projectId);
  const toast = useToast();
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    create.mutate(
      { name: name.trim(), parentId },
      {
        onSuccess: () => {
          setName('');
          onClose();
        },
        onError: (err) => toast(errorMessage(err), 'error'),
      },
    );
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New folder"
      size="sm"
      footer={
        <>
          <button className="btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form="new-folder" className="btn-primary" disabled={!name.trim() || create.isPending}>
            {create.isPending && <Spinner />} Create
          </button>
        </>
      }
    >
      <form id="new-folder" onSubmit={submit}>
        <Field label="Folder name">
          <input autoFocus className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Raw Footage" />
        </Field>
      </form>
    </Modal>
  );
}
