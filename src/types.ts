export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export type TaskKind = "to-do" | "project" | "heading" | "unknown";
export type TaskStatus = "open" | "canceled" | "completed" | "unknown";
export type ThingsList = "Inbox" | "Today" | "Anytime" | "Upcoming" | "Someday";
export type StartList = "Inbox" | "Anytime" | "Upcoming" | "Someday" | "Unknown";

export interface ChecklistItem {
  id: string;
  title: string;
  status: TaskStatus;
  stoppedAt: string | null;
  index: number | null;
}

export interface Tag {
  id: string;
  title: string;
  shortcut: string | null;
  parentId: string | null;
  index: number | null;
}

export interface Area {
  id: string;
  title: string;
  visible: boolean;
  tags: Tag[];
  index: number | null;
}

export interface Task {
  id: string;
  kind: TaskKind;
  status: TaskStatus;
  title: string;
  notes: string | null;
  trashed: boolean;
  list: StartList;
  isToday: boolean;
  isUpcoming: boolean;
  createdAt: string | null;
  modifiedAt: string | null;
  stoppedAt: string | null;
  startDate: string | null;
  scheduledDate: string | null;
  deadline: string | null;
  reminderTime: string | null;
  areaId: string | null;
  areaTitle: string | null;
  effectiveAreaId: string | null;
  effectiveAreaTitle: string | null;
  projectId: string | null;
  projectTitle: string | null;
  headingId: string | null;
  headingTitle: string | null;
  tags: Tag[];
  checklist: ChecklistItem[];
  lists: ThingsList[];
  index: number | null;
  todayIndex: number | null;
  todayIndexReferenceDate: string | null;
  raw?: Record<string, JsonValue>;
}

export interface Snapshot {
  generatedAt: string;
  source: {
    databasePath: string;
    databaseVersion: number | null;
    schemaVersionSupported: boolean;
  };
  counts: Record<string, number>;
  areas: Area[];
  tags: Tag[];
  tasks: Task[];
}

export interface StoreOptions {
  databasePath?: string;
}
