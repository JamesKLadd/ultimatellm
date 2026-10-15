import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@ultimatellm/ui';
import { Check, Copy, Download, FileCode, FileText, Files, Image, X } from 'lucide-react';
import { useState } from 'react';
import { formatBytes } from '../lib/format';
import { errorMessage } from '../lib/providers';
import { useExportFiles, useWorkspaceFile, useWorkspaceFiles } from '../lib/queries';

function FileIcon({ mime }: { mime: string }) {
  if (mime.startsWith('image/')) return <Image className="size-4 shrink-0 text-muted-foreground" />;
  if (mime === 'text/markdown' || mime === 'text/plain') {
    return <FileText className="size-4 shrink-0 text-muted-foreground" />;
  }
  return <FileCode className="size-4 shrink-0 text-muted-foreground" />;
}

/** The chat's workspace: files the models wrote, with a viewer and export. */
export function FilesPanel({ chatId, onClose }: { chatId: string; onClose: () => void }) {
  const files = useWorkspaceFiles(chatId);
  const exportFiles = useExportFiles();
  const [viewing, setViewing] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const list = files.data ?? [];

  const onExport = async () => {
    setNotice(null);
    try {
      const result = await exportFiles.mutateAsync(chatId);
      if (result) setNotice(`Exported ${result.count} files to ${result.folder}`);
    } catch (error) {
      setNotice(errorMessage(error));
    }
  };

  return (
    <aside
      aria-label="Files"
      data-testid="files-panel"
      className="flex w-80 shrink-0 flex-col border-l bg-muted/20"
    >
      <header className="flex h-11 shrink-0 items-center gap-2 border-b px-3">
        <Files className="size-4 text-muted-foreground" />
        <h2 className="text-sm font-medium">Files</h2>
        <span className="text-xs text-muted-foreground">{list.length}</span>
        <div className="ml-auto flex items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            disabled={list.length === 0 || exportFiles.isPending}
            onClick={() => void onExport()}
          >
            <Download /> Export
          </Button>
          <Button size="icon-sm" variant="ghost" aria-label="Close files" onClick={onClose}>
            <X />
          </Button>
        </div>
      </header>
      {notice && (
        <p role="status" className="border-b px-3 py-2 text-xs break-all text-muted-foreground">
          {notice}
        </p>
      )}
      {list.length === 0 ? (
        <p className="px-4 py-6 text-sm text-muted-foreground">
          No files yet. When the manager runs a workflow, the files it makes appear here.
        </p>
      ) : (
        <ul className="min-h-0 flex-1 overflow-y-auto p-1.5">
          {list.map((file) => {
            const slash = file.path.lastIndexOf('/');
            return (
              <li key={file.path}>
                <button
                  type="button"
                  data-testid="file-row"
                  onClick={() => setViewing(file.path)}
                  title={
                    file.writtenBy
                      ? `${file.writtenBy.title} · ${file.writtenBy.modelName ?? ''}`
                      : undefined
                  }
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent"
                >
                  <FileIcon mime={file.mime} />
                  <span className="min-w-0 flex-1 truncate font-mono text-[13px]">
                    {slash >= 0 && (
                      <span className="text-muted-foreground">{file.path.slice(0, slash + 1)}</span>
                    )}
                    {file.path.slice(slash + 1)}
                  </span>
                  {file.versions > 1 && <Badge variant="outline">v{file.versions}</Badge>}
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {formatBytes(file.size)}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <FileViewer chatId={chatId} path={viewing} onClose={() => setViewing(null)} />
    </aside>
  );
}

function FileViewer({
  chatId,
  path,
  onClose,
}: {
  chatId: string;
  path: string | null;
  onClose: () => void;
}) {
  const file = useWorkspaceFile(chatId, path);
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    if (!file.data) return;
    await navigator.clipboard.writeText(file.data.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <Dialog open={path !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex h-[min(720px,85vh)] flex-col gap-3 sm:max-w-4xl">
        <div className="flex items-center gap-3 pr-8">
          <DialogTitle className="truncate font-mono text-sm">{path}</DialogTitle>
          <DialogDescription className="sr-only">The file's current content.</DialogDescription>
          {file.data && (
            <span className="text-xs text-muted-foreground">{formatBytes(file.data.size)}</span>
          )}
          <Button
            size="sm"
            variant="outline"
            className="ml-auto"
            disabled={!file.data}
            onClick={() => void copy()}
          >
            {copied ? <Check /> : <Copy />} {copied ? 'Copied' : 'Copy'}
          </Button>
        </div>
        <pre
          data-testid="file-content"
          className="min-h-0 flex-1 overflow-auto rounded-lg border bg-muted/40 p-3 font-mono text-[13px] leading-relaxed select-text"
        >
          {file.data?.content ?? (file.isLoading ? 'Loading…' : 'This file no longer exists.')}
        </pre>
      </DialogContent>
    </Dialog>
  );
}
