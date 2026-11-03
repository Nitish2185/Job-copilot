import type { ApplicationStage } from "@job-copilot/shared";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
} from "@dnd-kit/core";
import { GripVertical } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import type { TrackerRow } from "@/lib/tracker/store";
import { STAGES, STAGE_LABELS, formatDay, stageLabel } from "@/lib/tracker/tracker";

function rowTitle(row: TrackerRow): string {
  return `${row.job?.title ?? "Job"} at ${row.job?.company.name ?? "unknown company"}`;
}

function Card({
  row,
  onOpen,
  flags,
}: {
  row: TrackerRow;
  onOpen: (id: string) => void;
  flags: string[];
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: row.app.id,
  });
  const style = transform
    ? { transform: `translate3d(${String(transform.x)}px, ${String(transform.y)}px, 0)` }
    : undefined;
  return (
    <li
      ref={setNodeRef}
      style={style}
      className={`flex items-start gap-1 rounded-md border border-slate-200 bg-white p-2 text-sm shadow-sm dark:border-slate-700 dark:bg-slate-900 ${isDragging ? "relative z-10 opacity-80 shadow-lg" : ""}`}
      data-testid="tracker-card"
    >
      <button
        type="button"
        className="mt-0.5 cursor-grab rounded p-0.5 text-slate-400 hover:text-slate-700 focus-visible:outline-2 focus-visible:outline-blue-600"
        aria-label={`Move ${rowTitle(row)}`}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-4" aria-hidden />
      </button>
      <button
        type="button"
        className="min-w-0 flex-1 text-left focus-visible:outline-2 focus-visible:outline-blue-600"
        onClick={() => {
          onOpen(row.app.id);
        }}
      >
        <span className="block truncate font-medium">{row.job?.title ?? "Job"}</span>
        <span className="block truncate text-xs text-slate-500">{row.job?.company.name}</span>
        <span className="mt-1 flex flex-wrap gap-1">
          <Badge>{formatDay(row.app.submittedAt)}</Badge>
          {row.app.mode === "auto" && <Badge tone="blue">Auto</Badge>}
          {flags.map((f) => (
            <Badge key={f} tone="amber">
              {f}
            </Badge>
          ))}
        </span>
      </button>
    </li>
  );
}

function Column({
  stage,
  rows,
  onOpen,
  flagsFor,
}: {
  stage: ApplicationStage;
  rows: TrackerRow[];
  onOpen: (id: string) => void;
  flagsFor: (row: TrackerRow) => string[];
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage });
  return (
    <section
      ref={setNodeRef}
      aria-label={STAGE_LABELS[stage]}
      className={`flex w-60 shrink-0 flex-col rounded-lg p-2 ${isOver ? "bg-blue-50 ring-2 ring-blue-400 dark:bg-blue-950" : "bg-slate-50 dark:bg-slate-900/50"}`}
    >
      <h2 className="mb-2 flex items-center justify-between px-1 text-sm font-semibold">
        {STAGE_LABELS[stage]}
        <span className="text-xs font-normal text-slate-500">{rows.length}</span>
      </h2>
      <ul className="min-h-16 space-y-2">
        {rows.map((row) => (
          <Card key={row.app.id} row={row} onOpen={onOpen} flags={flagsFor(row)} />
        ))}
      </ul>
    </section>
  );
}

/** Kanban board (spec 18.1): drag a card by its handle (mouse or keyboard) to change its stage. */
export function TrackerBoard({
  rows,
  onOpen,
  onMove,
  flagsFor,
}: {
  rows: TrackerRow[];
  onOpen: (id: string) => void;
  onMove: (id: string, stage: ApplicationStage) => void;
  flagsFor: (row: TrackerRow) => string[];
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  );
  const byId = new Map(rows.map((r) => [r.app.id, r]));
  const name = (id: string | number) => {
    const row = byId.get(String(id));
    return row ? rowTitle(row) : "Application";
  };
  const stageName = (id: string | number | undefined) =>
    id === undefined ? "no column" : stageLabel(String(id));
  const announcements: Announcements = {
    onDragStart: ({ active }) => `Picked up ${name(active.id)}.`,
    onDragOver: ({ active, over }) => `${name(active.id)} is over ${stageName(over?.id)}.`,
    onDragEnd: ({ active, over }) =>
      over ? `${name(active.id)} moved to ${stageName(over.id)}.` : `${name(active.id)} dropped.`,
    onDragCancel: ({ active }) => `Moving ${name(active.id)} was cancelled.`,
  };
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over) return;
    const stage = over.id as ApplicationStage;
    if (byId.get(String(active.id))?.app.stage !== stage) onMove(String(active.id), stage);
  };
  return (
    <DndContext
      sensors={sensors}
      onDragEnd={onDragEnd}
      accessibility={{
        announcements,
        screenReaderInstructions: {
          draggable:
            "Press space or enter to pick up the application, use the arrow keys to move it to another column, then press space or enter again to drop it. Press escape to cancel.",
        },
      }}
    >
      <div className="flex gap-3 overflow-x-auto pb-2" data-testid="tracker-board">
        {STAGES.map((stage) => (
          <Column
            key={stage}
            stage={stage}
            rows={rows.filter((r) => r.app.stage === stage)}
            onOpen={onOpen}
            flagsFor={flagsFor}
          />
        ))}
      </div>
    </DndContext>
  );
}
