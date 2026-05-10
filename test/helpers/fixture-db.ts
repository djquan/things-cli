import { Database } from "bun:sqlite";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { clockToThingsTime, isoDateToThingsDate, todayIsoDate } from "../../src/dates";

export function createFixtureDatabase(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "things-cli-"));
  const databasePath = path.join(dir, "main.sqlite");
  const db = new Database(databasePath, { create: true, strict: true });

  db.run(`create table Meta (key text primary key, value text)`);
  db.run(`create table TMArea (uuid text primary key, title text, visible integer, "index" integer)`);
  db.run(`create table TMTag (uuid text primary key, title text, shortcut text, parent text, "index" integer)`);
  db.run(`create table TMAreaTag (areas text not null, tags text not null)`);
  db.run(`create table TMTaskTag (tasks text not null, tags text not null)`);
  db.run(`create table TMChecklistItem (
    uuid text primary key,
    title text,
    status integer,
    stopDate real,
    "index" integer,
    task text
  )`);
  db.run(`create table TMSettings (uuid text primary key, uriSchemeAuthenticationToken text)`);
  db.run(`create table TMTombstone (uuid text primary key, deletionDate real, deletedObjectUUID text)`);
  db.run(`create table TMTask (
    uuid text primary key,
    leavesTombstone integer,
    creationDate real,
    userModificationDate real,
    type integer,
    status integer,
    stopDate real,
    trashed integer,
    title text,
    notes text,
    start integer,
    startDate integer,
    startBucket integer,
    reminderTime integer,
    deadline integer,
    "index" integer,
    todayIndex integer,
    todayIndexReferenceDate integer,
    area text,
    project text,
    heading text
  )`);

  db.run("insert into Meta (key, value) values ($key, $value)", {
    key: "databaseVersion",
    value: plistInteger(26)
  });
  db.run("insert into TMSettings (uuid, uriSchemeAuthenticationToken) values ('settings-1', 'secret-token')");
  db.run("insert into TMArea (uuid, title, visible, \"index\") values ('area-work', 'Work', 1, 1)");
  db.run("insert into TMTag (uuid, title, shortcut, parent, \"index\") values ('tag-focus', 'Focus', null, null, 1)");
  db.run("insert into TMTag (uuid, title, shortcut, parent, \"index\") values ('tag-errand', 'Errand', null, null, 2)");
  db.run("insert into TMAreaTag (areas, tags) values ('area-work', 'tag-focus')");

  const today = todayIsoDate();
  const future = futureIsoDate();
  const stoppedThisWeek = Date.parse("2026-05-08T12:00:00Z") / 1000;
  const stoppedEarlier = Date.parse("2026-04-28T12:00:00Z") / 1000;

  insertTask(db, {
    uuid: "project-1",
    type: 1,
    status: 0,
    title: "Launch project",
    notes: "Project note",
    start: 2,
    startDate: isoDateToThingsDate(future),
    deadline: isoDateToThingsDate("2099-05-20"),
    area: "area-work",
    todayIndex: null,
    index: 1
  });

  insertTask(db, {
    uuid: "task-today",
    type: 0,
    status: 0,
    title: "Write launch memo",
    notes: "Mention Things",
    start: 1,
    startDate: isoDateToThingsDate(today),
    reminderTime: clockToThingsTime("09:30"),
    project: "project-1",
    todayIndex: 1,
    todayIndexReferenceDate: isoDateToThingsDate(today),
    index: 2
  });

  insertTask(db, {
    uuid: "task-future-with-today-index",
    type: 0,
    status: 0,
    title: "Future task with stale today index",
    notes: null,
    start: 2,
    startDate: isoDateToThingsDate(future),
    deadline: isoDateToThingsDate("2099-05-20"),
    area: "area-work",
    todayIndex: 0,
    todayIndexReferenceDate: isoDateToThingsDate(future),
    index: 3
  });

  insertTask(db, {
    uuid: "task-inbox",
    type: 0,
    status: 0,
    title: "Inbox capture",
    notes: null,
    start: 0,
    area: null,
    todayIndex: null,
    index: 4
  });

  insertTask(db, {
    uuid: "task-in-heading",
    type: 0,
    status: 0,
    title: "Task in heading",
    notes: null,
    start: 1,
    heading: "heading-1",
    todayIndex: null,
    index: 6
  });

  insertTask(db, {
    uuid: "task-upcoming-reference-date",
    type: 0,
    status: 0,
    title: "Upcoming reference-date task",
    notes: null,
    start: 2,
    area: "area-work",
    todayIndex: 0,
    todayIndexReferenceDate: isoDateToThingsDate(future),
    index: 7
  });

  insertTask(db, {
    uuid: "task-future-start-overdue-deadline",
    type: 0,
    status: 0,
    title: "Future start with overdue deadline",
    notes: null,
    start: 2,
    startDate: isoDateToThingsDate(future),
    deadline: isoDateToThingsDate(today),
    area: "area-work",
    todayIndex: 0,
    todayIndexReferenceDate: isoDateToThingsDate(future),
    index: 8
  });

  insertTask(db, {
    uuid: "task-done",
    type: 0,
    status: 3,
    title: "Completed task",
    notes: null,
    start: 1,
    stopDate: stoppedThisWeek,
    area: null,
    todayIndex: null,
    index: 4
  });

  insertTask(db, {
    uuid: "task-canceled",
    type: 0,
    status: 2,
    title: "Canceled task",
    notes: null,
    start: 1,
    stopDate: stoppedThisWeek,
    area: null,
    todayIndex: null,
    index: 9
  });

  insertTask(db, {
    uuid: "task-done-earlier",
    type: 0,
    status: 3,
    title: "Earlier completed task",
    notes: null,
    start: 1,
    stopDate: stoppedEarlier,
    area: null,
    todayIndex: null,
    index: 10
  });

  insertTask(db, {
    uuid: "heading-1",
    type: 2,
    status: 0,
    title: "Heading",
    notes: null,
    start: 1,
    project: "project-1",
    todayIndex: null,
    index: 5
  });

  db.run("insert into TMTaskTag (tasks, tags) values ('task-today', 'tag-focus')");
  db.run("insert into TMTaskTag (tasks, tags) values ('task-inbox', 'tag-errand')");
  db.run("insert into TMChecklistItem (uuid, title, status, stopDate, \"index\", task) values ('check-1', 'Draft', 0, null, 1, 'task-today')");
  db.run("insert into TMChecklistItem (uuid, title, status, stopDate, \"index\", task) values ('check-2', 'Review', 3, 1778396400, 2, 'task-today')");

  db.close();
  return databasePath;
}

function futureIsoDate(): string {
  const date = new Date();
  date.setFullYear(date.getFullYear() + 1);
  return todayIsoDate(date);
}

function insertTask(
  db: Database,
  values: {
    uuid: string;
    type: number;
    status: number;
    title: string;
    notes: string | null;
    start: number;
    startDate?: number | null;
    stopDate?: number | null;
    reminderTime?: number | null;
    deadline?: number | null;
    area?: string | null;
    project?: string | null;
    heading?: string | null;
    todayIndex?: number | null;
    todayIndexReferenceDate?: number | null;
    index: number;
  }
): void {
  db.run(
    `insert into TMTask (
      uuid,
      leavesTombstone,
      creationDate,
      userModificationDate,
      type,
      status,
      stopDate,
      trashed,
      title,
      notes,
      start,
      startDate,
      startBucket,
      reminderTime,
      deadline,
      "index",
      todayIndex,
      todayIndexReferenceDate,
      area,
      project,
      heading
    ) values (
      $uuid,
      1,
      1778396400,
      1778396500,
      $type,
      $status,
      $stopDate,
      0,
      $title,
      $notes,
      $start,
      $startDate,
      0,
      $reminderTime,
      $deadline,
      $index,
      $todayIndex,
      $todayIndexReferenceDate,
      $area,
      $project,
      $heading
    )`,
    {
      uuid: values.uuid,
      type: values.type,
      status: values.status,
      stopDate: values.stopDate ?? null,
      title: values.title,
      notes: values.notes,
      start: values.start,
      startDate: values.startDate ?? null,
      reminderTime: values.reminderTime ?? null,
      deadline: values.deadline ?? null,
      index: values.index,
      todayIndex: values.todayIndex ?? null,
      todayIndexReferenceDate: values.todayIndexReferenceDate ?? null,
      area: values.area ?? null,
      project: values.project ?? null,
      heading: values.heading ?? null
    }
  );
}

function plistInteger(value: number): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<integer>${value}</integer>
</plist>
`;
}
