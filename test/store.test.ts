import { expect, test } from "bun:test";
import { ThingsStore } from "../src/db";
import { todayIsoDate } from "../src/dates";
import { createFixtureDatabase } from "./helpers/fixture-db";

test("doctor validates required schema and hides auth token", () => {
  const store = new ThingsStore({ databasePath: createFixtureDatabase() });
  const doctor = store.doctor();
  store.close();

  expect(doctor.ok).toBe(true);
  expect(doctor.databaseVersion).toBe(26);
  expect(doctor.hasUrlAuthToken).toBe(true);
  expect(JSON.stringify(doctor)).not.toContain("secret-token");
});

test("normalizes tasks with tags, checklist, dates, and relationships", () => {
  const store = new ThingsStore({ databasePath: createFixtureDatabase() });
  const task = store.show("task-today");
  store.close();

  expect(task?.title).toBe("Write launch memo");
  expect(task?.kind).toBe("to-do");
  expect(task?.status).toBe("open");
  expect(task?.list).toBe("Anytime");
  expect(task?.lists).toEqual(["Today", "Anytime"]);
  expect(task?.isToday).toBe(true);
  expect(task?.startDate).toBe(todayIsoDate());
  expect(task?.scheduledDate).toBe(todayIsoDate());
  expect(task?.reminderTime).toBe("09:30");
  expect(task?.projectTitle).toBe("Launch project");
  expect(task?.areaTitle).toBeNull();
  expect(task?.effectiveAreaTitle).toBe("Work");
  expect(task?.tags.map((tag) => tag.title)).toEqual(["Focus"]);
  expect(task?.checklist.map((item) => item.title)).toEqual(["Draft", "Review"]);
});

test("inherits effective area through project and heading project", () => {
  const store = new ThingsStore({ databasePath: createFixtureDatabase() });
  const projectTask = store.show("task-today");
  const headingTask = store.show("task-in-heading");
  store.close();

  expect(projectTask?.areaTitle).toBeNull();
  expect(projectTask?.effectiveAreaTitle).toBe("Work");
  expect(headingTask?.areaTitle).toBeNull();
  expect(headingTask?.projectTitle).toBeNull();
  expect(headingTask?.headingTitle).toBe("Heading");
  expect(headingTask?.effectiveAreaTitle).toBe("Work");
});

test("does not treat stale todayIndex as Today membership", () => {
  const store = new ThingsStore({ databasePath: createFixtureDatabase() });
  const task = store.show("task-future-with-today-index");
  store.close();

  expect(task?.list).toBe("Upcoming");
  expect(task?.lists).toEqual(["Upcoming"]);
  expect(task?.todayIndex).toBe(0);
  expect(task?.isToday).toBe(false);
  expect(task?.isUpcoming).toBe(true);
});

test("uses todayIndexReferenceDate as the scheduled date for upcoming rows", () => {
  const store = new ThingsStore({ databasePath: createFixtureDatabase() });
  const task = store.show("task-upcoming-reference-date");
  store.close();

  expect(task?.startDate).toBeNull();
  expect(task?.scheduledDate).not.toBeNull();
  expect(task?.list).toBe("Upcoming");
  expect(task?.lists).toEqual(["Upcoming"]);
  expect(task?.isUpcoming).toBe(true);
});

test("does not use deadline alone as Today membership", () => {
  const store = new ThingsStore({ databasePath: createFixtureDatabase() });
  const task = store.show("task-future-start-overdue-deadline");
  const today = store.today();
  const upcoming = store.upcoming();
  store.close();

  expect(task?.deadline).toBe(todayIsoDate());
  expect(task?.list).toBe("Upcoming");
  expect(task?.isToday).toBe(false);
  expect(task?.isUpcoming).toBe(true);
  expect(today.map((item) => item.id)).not.toContain("task-future-start-overdue-deadline");
  expect(upcoming.map((item) => item.id)).toContain("task-future-start-overdue-deadline");
});

test("does not treat undated Anytime tasks as Today", () => {
  const store = new ThingsStore({ databasePath: createFixtureDatabase() });
  const task = store.show("task-in-heading");
  const today = store.today();
  const anytime = store.anytime();
  store.close();

  expect(task?.list).toBe("Anytime");
  expect(task?.startDate).toBeNull();
  expect(task?.deadline).toBeNull();
  expect(task?.isToday).toBe(false);
  expect(today.map((item) => item.id)).not.toContain("task-in-heading");
  expect(anytime.map((item) => item.id)).toContain("task-in-heading");
});

test("returns focused completed and logbook history by stop date", () => {
  const store = new ThingsStore({ databasePath: createFixtureDatabase() });
  const completed = store.completed({ since: "2026-05-01", until: "2026-05-10" });
  const logbook = store.logbook({ since: "2026-05-01", until: "2026-05-10", includeCanceled: true });
  store.close();

  expect(completed.map((task) => task.id)).toEqual(["task-done"]);
  expect(completed[0]?.stoppedAt?.slice(0, 10)).toBe("2026-05-08");
  expect(logbook.map((task) => task.id).sort()).toEqual(["task-canceled", "task-done"]);
});

test("context reports lossy completeness and per-section omission counts", () => {
  const store = new ThingsStore({ databasePath: createFixtureDatabase() });
  const context = store.context(1) as {
    complete: boolean;
    auditSafe: boolean;
    lossy: boolean;
    sections: Record<string, { total: number; shown: number; omitted: number; truncated: boolean }>;
    upcoming: unknown[];
  };
  store.close();

  expect(context.complete).toBe(false);
  expect(context.auditSafe).toBe(false);
  expect(context.lossy).toBe(true);
  expect(context.sections.upcoming?.total).toBe(4);
  expect(context.sections.upcoming?.shown).toBe(context.upcoming.length);
  expect(context.sections.upcoming?.omitted).toBe(4 - context.upcoming.length);
});

test("returns focused list views for LLM ingestion", () => {
  const store = new ThingsStore({ databasePath: createFixtureDatabase() });
  const today = store.today();
  const inbox = store.inbox();
  const upcoming = store.upcoming();
  const search = store.search("capture");
  store.close();

  expect(today.map((task) => task.id)).toEqual(["task-today"]);
  expect(inbox.map((task) => task.id)).toEqual(["task-inbox"]);
  expect(upcoming.map((task) => task.id).sort()).toEqual([
    "project-1",
    "task-future-start-overdue-deadline",
    "task-future-with-today-index",
    "task-upcoming-reference-date"
  ]);
  expect(search.map((task) => task.id)).toEqual(["task-inbox"]);
});
