import { expect, test } from "bun:test";
import { clockToThingsTime, isoDateToThingsDate, thingsDateToIsoDate, thingsTimeToClock } from "../src/dates";

test("decodes Things date bit fields", () => {
  expect(thingsDateToIsoDate(132464128)).toBe("2021-03-28");
  expect(thingsDateToIsoDate(isoDateToThingsDate("2026-05-10"))).toBe("2026-05-10");
});

test("decodes Things reminder time bit fields", () => {
  expect(thingsTimeToClock(840957952)).toBe("12:34");
  expect(thingsTimeToClock(clockToThingsTime("09:30"))).toBe("09:30");
});
