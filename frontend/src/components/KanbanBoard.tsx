import { useMemo, useState, type ReactNode } from 'react';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCorners,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { TaskCard } from './TaskCard';
import { cn } from '../lib/format';
import type { Task } from '../types';

export interface KanbanColumn {
  id: string;
  title: string;
  color?: string | null;
  subtitle?: string;
  tasks: Task[];
}

interface Props {
  columns: KanbanColumn[];
  onMove: (task: Task, toColumnId: string) => void;
  onOpen: (task: Task) => void;
  clientSafe?: boolean;
  columnAction?: (col: KanbanColumn) => ReactNode;
  trailing?: ReactNode;
}

export function KanbanBoard({ columns, onMove, onOpen, clientSafe, columnAction, trailing }: Props) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    // Long-press to drag on touch devices so horizontal scrolling still works.
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
    useSensor(KeyboardSensor),
  );

  const taskIndex = useMemo(() => {
    const m = new Map<string, { task: Task; col: string }>();
    for (const c of columns) for (const t of c.tasks) m.set(t.id, { task: t, col: c.id });
    return m;
  }, [columns]);

  const onDragStart = (e: DragStartEvent) => setActiveId(String(e.active.id));
  const onDragEnd = (e: DragEndEvent) => {
    setActiveId(null);
    const entry = taskIndex.get(String(e.active.id));
    const to = e.over?.id ? String(e.over.id) : null;
    if (entry && to && to !== entry.col) onMove(entry.task, to);
  };

  const active = activeId ? taskIndex.get(activeId)?.task : undefined;

  return (
    <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setActiveId(null)}>
      <div className="no-scrollbar -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-4 sm:mx-0 sm:snap-none sm:px-0">
        {columns.map((col) => (
          <Column key={col.id} col={col} onOpen={onOpen} clientSafe={clientSafe} action={columnAction?.(col)} activeId={activeId} />
        ))}
        {trailing}
      </div>
      <DragOverlay dropAnimation={{ duration: 180, easing: 'cubic-bezier(0.16,1,0.3,1)' }}>
        {active ? (
          <div className="w-[17rem]">
            <TaskCard task={active} clientSafe={clientSafe} dragging />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

function Column({ col, onOpen, clientSafe, action, activeId }: { col: KanbanColumn; onOpen: (t: Task) => void; clientSafe?: boolean; action?: ReactNode; activeId: string | null }) {
  const { setNodeRef, isOver } = useDroppable({ id: col.id });
  return (
    <section
      ref={setNodeRef}
      className={cn(
        'flex max-h-[calc(100dvh-15rem)] w-[82vw] max-w-[19rem] shrink-0 snap-start flex-col rounded-2xl border bg-slate-100/70 transition sm:w-72',
        isOver ? 'border-brand-300 bg-brand-50/70 ring-4 ring-brand-100' : 'border-transparent',
      )}
    >
      <header className="flex items-center gap-2 px-3 pb-2 pt-3">
        <span className="size-2.5 rounded-full" style={{ background: col.color || '#6366f1' }} />
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold text-slate-800">{col.title}</h3>
          {col.subtitle && <p className="truncate text-[11px] text-slate-500">{col.subtitle}</p>}
        </div>
        <span className="rounded-full bg-white px-2 py-0.5 text-xs font-medium text-slate-500 shadow-xs">{col.tasks.length}</span>
        {action}
      </header>
      <div className="flex-1 space-y-2 overflow-y-auto px-2 pb-3">
        {col.tasks.map((t) => (
          <DraggableCard key={t.id} task={t} onOpen={onOpen} clientSafe={clientSafe} hidden={activeId === t.id} />
        ))}
        {col.tasks.length === 0 && (
          <div className="rounded-xl border border-dashed border-slate-300/80 px-3 py-6 text-center text-xs text-slate-400">Drop tasks here</div>
        )}
      </div>
    </section>
  );
}

function DraggableCard({ task, onOpen, clientSafe, hidden }: { task: Task; onOpen: (t: Task) => void; clientSafe?: boolean; hidden: boolean }) {
  const { attributes, listeners, setNodeRef } = useDraggable({ id: task.id });
  return (
    <div ref={setNodeRef} {...attributes} {...listeners} className={cn('touch-manipulation', hidden && 'opacity-30')}>
      <TaskCard task={task} onClick={() => onOpen(task)} clientSafe={clientSafe} />
    </div>
  );
}
