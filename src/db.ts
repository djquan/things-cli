import { Database } from "bun:sqlite";
import { findThingsDatabasePath } from "./path";
import { thingsDateToIsoDate, todayIsoDate, unixSecondsToIso, thingsTimeToClock } from "./dates";
import type { Area, ChecklistItem, Snapshot, StoreOptions, Tag, Task, TaskKind, TaskStatus } from "./types";

const SUPPORTED_DATABASE_VERSION = 26;

interface TaskRow {
  uuid: string;
  leavesTombstone: number | null;
  creationDate: number | null;
  userModificationDate: number | null;
  type: number | null;
  status: number | null;
  stopDate: number | null;
  trashed: number | null;
  title: string | null;
  notes: string | null;
  start: number | null;
  startDate: number | null;
  startBucket: number | null;
  reminderTime: number | null;
  deadline: number | null;
  index: number | null;
  todayIndex: number | null;
  todayIndexReferenceDate: number | null;
  area: string | null;
  areaTitle: string | null;
  projectArea: string | null;
  projectAreaTitle: string | null;
  headingProjectArea: string | null;
  headingProjectAreaTitle: string | null;
  project: string | null;
  projectTitle: string | null;
  heading: string | null;
  headingTitle: string | null;
}

interface AreaRow {
  uuid: string;
  title: string | null;
  visible: number | null;
  index: number | null;
}

interface TagRow {
  uuid: string;
  title: string | null;
  shortcut: string | null;
  parent: string | null;
  index: number | null;
}

interface ChecklistRow {
  uuid: string;
  title: string | null;
  status: number | null;
  stopDate: number | null;
  index: number | null;
  task: string;
}

export class ThingsStore {
  readonly databasePath: string;
  private readonly db: Database;

  constructor(options: StoreOptions = {}) {
    this.databasePath = findThingsDatabasePath(options.databasePath);
    this.db = new Database(this.databasePath, {
      readonly: true,
      strict: true,
      safeIntegers: false
    });
  }

  close(): void {
    this.db.close();
  }

  doctor(): Record<string, unknown> {
    const tables = this.db
      .query<{ name: string }, []>(
        "select name from sqlite_schema where type = 'table' order by name"
      )
      .all()
      .map((row) => row.name);
    const requiredTables = ["Meta", "TMArea", "TMChecklistItem", "TMSettings", "TMTag", "TMTask", "TMTaskTag"];
    const missingTables = requiredTables.filter((table) => !tables.includes(table));
    const databaseVersion = this.databaseVersion();
    const counts = this.counts();
    const hasAuthToken = Boolean(this.authToken());

    return {
      ok: missingTables.length === 0 && databaseVersion === SUPPORTED_DATABASE_VERSION,
      databasePath: this.databasePath,
      databaseVersion,
      supportedDatabaseVersion: SUPPORTED_DATABASE_VERSION,
      schemaVersionSupported: databaseVersion === SUPPORTED_DATABASE_VERSION,
      missingTables,
      hasUrlAuthToken: hasAuthToken,
      counts
    };
  }

  snapshot(options: { includeTrashed?: boolean; raw?: boolean } = {}): Snapshot {
    return {
      generatedAt: new Date().toISOString(),
      source: {
        databasePath: this.databasePath,
        databaseVersion: this.databaseVersion(),
        schemaVersionSupported: this.databaseVersion() === SUPPORTED_DATABASE_VERSION
      },
      counts: this.counts(),
      areas: this.areas(),
      tags: this.tags(),
      tasks: this.tasks(options)
    };
  }

  counts(): Record<string, number> {
    const tables = ["TMArea", "TMTag", "TMTask", "TMChecklistItem", "TMTombstone"];
    return Object.fromEntries(
      tables.map((table) => {
        const row = this.db.query<{ count: number }, []>(`select count(*) as count from ${table}`).get();
        return [table, row?.count ?? 0];
      })
    );
  }

  databaseVersion(): number | null {
    const row = this.db
      .query<{ value: string | null }, []>("select value from Meta where key = 'databaseVersion'")
      .get();
    if (!row?.value) {
      return null;
    }

    const match = /<integer>(\d+)<\/integer>/.exec(row.value);
    return match ? Number(match[1]) : null;
  }

  authToken(): string | null {
    const row = this.db
      .query<{ uriSchemeAuthenticationToken: string | null }, []>(
        "select uriSchemeAuthenticationToken from TMSettings where uriSchemeAuthenticationToken is not null limit 1"
      )
      .get();
    return row?.uriSchemeAuthenticationToken ?? null;
  }

  areas(): Area[] {
    const areaTags = this.mapAreaTags();
    return this.db
      .query<AreaRow, []>('select uuid, title, visible, "index" from TMArea order by "index", title')
      .all()
      .map((row) => ({
        id: row.uuid,
        title: row.title ?? "",
        visible: row.visible === 1,
        tags: areaTags.get(row.uuid) ?? [],
        index: row.index
      }));
  }

  tags(): Tag[] {
    return this.tagRows().map(normalizeTag);
  }

  tasks(options: { includeTrashed?: boolean; raw?: boolean } = {}): Task[] {
    const taskTags = this.mapTaskTags();
    const checklist = this.mapChecklistItems();
    const rows = this.taskRows(options.includeTrashed ?? false);
    return rows.map((row) => normalizeTask(row, taskTags.get(row.uuid) ?? [], checklist.get(row.uuid) ?? [], options.raw));
  }

  today(): Task[] {
    return this.tasks().filter((task) => task.status === "open" && isListItem(task) && task.lists.includes("Today"));
  }

  inbox(): Task[] {
    return this.tasks().filter((task) => task.status === "open" && isListItem(task) && task.list === "Inbox");
  }

  anytime(): Task[] {
    return this.tasks().filter((task) => task.status === "open" && isListItem(task) && task.list === "Anytime");
  }

  upcoming(): Task[] {
    return this.tasks().filter((task) => task.status === "open" && isListItem(task) && task.lists.includes("Upcoming"));
  }

  projects(): Task[] {
    return this.tasks().filter((task) => task.kind === "project");
  }

  show(id: string): Task | null {
    return this.tasks({ includeTrashed: true, raw: true }).find((task) => task.id === id) ?? null;
  }

  search(query: string): Task[] {
    const needle = query.trim().toLowerCase();
    if (!needle) {
      return [];
    }

    return this.tasks().filter((task) => {
      const haystack = [
        task.title,
        task.notes,
        task.areaTitle,
        task.effectiveAreaTitle,
        task.projectTitle,
        task.headingTitle,
        ...task.tags.map((tag) => tag.title),
        ...task.checklist.map((item) => item.title)
      ]
        .filter(Boolean)
        .join("\n")
        .toLowerCase();
      return haystack.includes(needle);
    });
  }

  context(tokenBudget: number): Record<string, unknown> {
    const today = this.today();
    const inbox = this.inbox();
    const anytime = this.anytime();
    const upcoming = this.upcoming().slice(0, 50);
    const openProjects = this.projects().filter((task) => task.status === "open");
    const payload = {
      generatedAt: new Date().toISOString(),
      tokenBudget,
      counts: this.counts(),
      today,
      inbox,
      anytime,
      upcoming,
      openProjects
    };

    return trimForBudget(payload, tokenBudget);
  }

  private taskRows(includeTrashed: boolean): TaskRow[] {
    const trashedPredicate = includeTrashed ? "1 = 1" : "coalesce(TASK.trashed, 0) = 0";
    return this.db
      .query<TaskRow, []>(`
        select
          TASK.uuid,
          TASK.leavesTombstone,
          TASK.creationDate,
          TASK.userModificationDate,
          TASK.type,
          TASK.status,
          TASK.stopDate,
          TASK.trashed,
          TASK.title,
          TASK.notes,
          TASK.start,
          TASK.startDate,
          TASK.startBucket,
          TASK.reminderTime,
          TASK.deadline,
          TASK."index",
          TASK.todayIndex,
          TASK.todayIndexReferenceDate,
          TASK.area,
          AREA.title as areaTitle,
          PROJECT.area as projectArea,
          PROJECT_AREA.title as projectAreaTitle,
          HEADING_PROJECT.area as headingProjectArea,
          HEADING_PROJECT_AREA.title as headingProjectAreaTitle,
          TASK.project,
          PROJECT.title as projectTitle,
          TASK.heading,
          HEADING.title as headingTitle
        from TMTask as TASK
        left join TMArea as AREA on TASK.area = AREA.uuid
        left join TMTask as PROJECT on TASK.project = PROJECT.uuid
        left join TMArea as PROJECT_AREA on PROJECT.area = PROJECT_AREA.uuid
        left join TMTask as HEADING on TASK.heading = HEADING.uuid
        left join TMTask as HEADING_PROJECT on HEADING.project = HEADING_PROJECT.uuid
        left join TMArea as HEADING_PROJECT_AREA on HEADING_PROJECT.area = HEADING_PROJECT_AREA.uuid
        where ${trashedPredicate}
        order by coalesce(TASK.todayIndex, 9223372036854775807), TASK.start, TASK."index", TASK.title
      `)
      .all();
  }

  private tagRows(): TagRow[] {
    return this.db
      .query<TagRow, []>('select uuid, title, shortcut, parent, "index" from TMTag order by "index", title')
      .all();
  }

  private mapTaskTags(): Map<string, Tag[]> {
    const tagsById = new Map(this.tags().map((tag) => [tag.id, tag]));
    const rows = this.db.query<{ tasks: string; tags: string }, []>("select tasks, tags from TMTaskTag").all();
    const result = new Map<string, Tag[]>();
    for (const row of rows) {
      const tag = tagsById.get(row.tags);
      if (!tag) {
        continue;
      }
      const tags = result.get(row.tasks) ?? [];
      tags.push(tag);
      result.set(row.tasks, tags);
    }
    return sortTagMap(result);
  }

  private mapAreaTags(): Map<string, Tag[]> {
    const tagsById = new Map(this.tags().map((tag) => [tag.id, tag]));
    const rows = this.db.query<{ areas: string; tags: string }, []>("select areas, tags from TMAreaTag").all();
    const result = new Map<string, Tag[]>();
    for (const row of rows) {
      const tag = tagsById.get(row.tags);
      if (!tag) {
        continue;
      }
      const tags = result.get(row.areas) ?? [];
      tags.push(tag);
      result.set(row.areas, tags);
    }
    return sortTagMap(result);
  }

  private mapChecklistItems(): Map<string, ChecklistItem[]> {
    const rows = this.db
      .query<ChecklistRow, []>(
        'select uuid, title, status, stopDate, "index", task from TMChecklistItem order by task, "index", title'
      )
      .all();
    const result = new Map<string, ChecklistItem[]>();

    for (const row of rows) {
      const items = result.get(row.task) ?? [];
      items.push({
        id: row.uuid,
        title: row.title ?? "",
        status: normalizeStatus(row.status),
        stoppedAt: unixSecondsToIso(row.stopDate),
        index: row.index
      });
      result.set(row.task, items);
    }

    return result;
  }
}

function normalizeTask(row: TaskRow, tags: Tag[], checklist: ChecklistItem[], includeRaw = false): Task {
  const startDate = thingsDateToIsoDate(row.startDate);
  const todayIndexReferenceDate = thingsDateToIsoDate(row.todayIndexReferenceDate);
  const scheduledDate = startDate ?? todayIndexReferenceDate;
  const deadline = thingsDateToIsoDate(row.deadline);
  const list = normalizePrimaryList(row, scheduledDate);
  const lists = normalizeListMembership(row, scheduledDate);
  const effectiveArea = resolveEffectiveArea(row);
  const task: Task = {
    id: row.uuid,
    kind: normalizeKind(row.type),
    status: normalizeStatus(row.status),
    title: row.title ?? "",
    notes: row.notes,
    trashed: row.trashed === 1,
    list,
    isToday: lists.includes("Today"),
    isUpcoming: lists.includes("Upcoming"),
    createdAt: unixSecondsToIso(row.creationDate),
    modifiedAt: unixSecondsToIso(row.userModificationDate),
    stoppedAt: unixSecondsToIso(row.stopDate),
    startDate,
    scheduledDate,
    deadline,
    reminderTime: thingsTimeToClock(row.reminderTime),
    areaId: row.area,
    areaTitle: row.areaTitle,
    effectiveAreaId: effectiveArea.id,
    effectiveAreaTitle: effectiveArea.title,
    projectId: row.project,
    projectTitle: row.projectTitle,
    headingId: row.heading,
    headingTitle: row.headingTitle,
    tags,
    checklist,
    lists,
    index: row.index,
    todayIndex: row.todayIndex,
    todayIndexReferenceDate
  };

  if (includeRaw) {
    task.raw = {
      type: row.type,
      status: row.status,
      start: row.start,
      startBucket: row.startBucket,
      startDate: row.startDate,
      todayIndexReferenceDate: row.todayIndexReferenceDate,
      deadline: row.deadline,
      reminderTime: row.reminderTime,
      projectArea: row.projectArea,
      headingProjectArea: row.headingProjectArea,
      leavesTombstone: row.leavesTombstone
    };
  }

  return task;
}

function resolveEffectiveArea(row: TaskRow): { id: string | null; title: string | null } {
  if (row.area || row.areaTitle) {
    return { id: row.area, title: row.areaTitle };
  }

  if (row.projectArea || row.projectAreaTitle) {
    return { id: row.projectArea, title: row.projectAreaTitle };
  }

  return {
    id: row.headingProjectArea,
    title: row.headingProjectAreaTitle
  };
}

function isListItem(task: Task): boolean {
  return task.kind === "to-do" || task.kind === "project";
}

function normalizeTag(row: TagRow): Tag {
  return {
    id: row.uuid,
    title: row.title ?? "",
    shortcut: row.shortcut,
    parentId: row.parent,
    index: row.index
  };
}

function normalizeKind(value: number | null): TaskKind {
  if (value === 0) return "to-do";
  if (value === 1) return "project";
  if (value === 2) return "heading";
  return "unknown";
}

function normalizeStatus(value: number | null): TaskStatus {
  if (value === 0) return "open";
  if (value === 2) return "canceled";
  if (value === 3) return "completed";
  return "unknown";
}

function normalizePrimaryList(row: TaskRow, scheduledDate: string | null): "Inbox" | "Anytime" | "Upcoming" | "Someday" | "Unknown" {
  if (row.start === 0) return "Inbox";
  if (row.start === 1) return "Anytime";
  if (row.start === 2 && scheduledDate != null && scheduledDate > todayIsoDate()) return "Upcoming";
  if (row.start === 2) return "Someday";
  return "Unknown";
}

function normalizeListMembership(row: TaskRow, scheduledDate: string | null): ("Inbox" | "Today" | "Anytime" | "Upcoming" | "Someday")[] {
  if (row.start === 0) return ["Inbox"];
  if (row.start === 1) {
    return scheduledDate != null && scheduledDate <= todayIsoDate() ? ["Today", "Anytime"] : ["Anytime"];
  }
  if (row.start === 2 && scheduledDate != null && scheduledDate > todayIsoDate()) return ["Upcoming"];
  if (row.start === 2) return ["Someday"];
  return [];
}

function sortTagMap(input: Map<string, Tag[]>): Map<string, Tag[]> {
  for (const tags of input.values()) {
    tags.sort((left, right) => (left.index ?? 0) - (right.index ?? 0) || left.title.localeCompare(right.title));
  }
  return input;
}

function trimForBudget<T extends Record<string, unknown>>(payload: T, tokenBudget: number): T {
  const maxCharacters = Math.max(1000, tokenBudget * 4);
  let output = payload;
  while (JSON.stringify(output).length > maxCharacters) {
    const next = { ...output } as Record<string, unknown>;
    for (const key of ["openProjects", "upcoming", "anytime", "inbox", "today"]) {
      const value = next[key];
      if (Array.isArray(value) && value.length > 1) {
        next[key] = value.slice(0, Math.ceil(value.length / 2));
        output = next as T;
        break;
      }
    }

    if (JSON.stringify(output).length <= maxCharacters) {
      break;
    }

    const arrays = ["openProjects", "upcoming", "anytime", "inbox", "today"].map((key) => output[key]).filter(Array.isArray);
    if (arrays.every((value) => value.length <= 1)) {
      break;
    }
  }
  return output;
}
