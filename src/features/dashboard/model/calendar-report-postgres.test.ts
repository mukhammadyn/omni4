import { execFileSync } from "node:child_process";
import { expect, test } from "vitest";
import { sqlSupportIssue } from "./sql-query-guidance";

const socket = process.env["OMNI4_AGE_PG_SOCKET"];
const asOf = "DATE '2026-10-30'";
const age = `EXTRACT(YEAR FROM AGE(${asOf}, e.birth_date))`;
const band = `CASE WHEN e.birth_date IS NULL THEN 6 WHEN e.birth_date > ${asOf} THEN 7 WHEN ${age} <= 25 THEN 1 WHEN ${age} <= 30 THEN 2 WHEN ${age} <= 40 THEN 3 WHEN ${age} <= 54 THEN 4 ELSE 5 END`;
const fixture = `CREATE TEMP TABLE age_fixture (guid int, birth_date date, status text);
INSERT INTO age_fixture VALUES (1,'2001-10-30','active'),(2,'2000-10-30','active'),(3,'1996-10-30','active'),(4,'1995-10-30','active'),(5,'1986-10-30','active'),(6,'1985-10-30','active'),(7,'1972-10-30','active'),(8,'1971-10-30','active'),(9,NULL,'active'),(10,'2027-01-01','active'),(11,'1980-01-01','dismissed');`;
function run(sql: string) {
  expect(sqlSupportIssue(sql)).toBeNull();
  const output = execFileSync("/opt/homebrew/opt/postgresql@14/bin/psql", ["-XqAt", "-v", "ON_ERROR_STOP=1", "-h", socket!, "-p", process.env["OMNI4_AGE_PG_PORT"] ?? "55489", "-U", "omni4age", "-d", "postgres", "-c", `${fixture} SELECT json_agg(r) FROM (${sql}) r`], { encoding: "utf8" });
  return JSON.parse(output) as Record<string, number | null>[];
}

test.skipIf(!socket)("calendar SQL reconciles every boundary, null/future DOB and zero months in PostgreSQL", () => {
  const bands = run(`SELECT g AS band, COUNT(e.guid) AS employees FROM generate_series(1,7) AS g LEFT JOIN age_fixture AS e ON ${band} = g AND e.status = 'active' GROUP BY g ORDER BY band`);
  expect(bands.map((row) => row.employees)).toEqual([1, 2, 2, 2, 1, 1, 1]);
  expect(bands.reduce((sum, row) => sum + Number(row.employees), 0)).toBe(10);
  const months = run(`SELECT m AS month, COUNT(e.guid) AS employees FROM generate_series(1,12) AS m LEFT JOIN age_fixture AS e ON EXTRACT(MONTH FROM e.birth_date) = m AND e.status = 'active' AND e.birth_date <= ${asOf} GROUP BY m ORDER BY month`);
  expect(months).toHaveLength(12);
  expect(months.map((row) => row.employees)).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 8, 0, 0]);
  expect(run(`SELECT ROUND(AVG(${age}),1) AS mean, MIN(${age}) AS youngest, MAX(${age}) AS oldest, COUNT(*) AS known FROM age_fixture AS e WHERE e.status = 'active' AND e.birth_date <= ${asOf}`)).toEqual([{ mean: 37.8, youngest: 25, oldest: 55, known: 8 }]);
});

test.skipIf(!socket)("completed calendar age handles birthday day and leap birthdays", () => {
  expect(run("SELECT EXTRACT(YEAR FROM AGE(DATE '2026-10-29',DATE '2001-10-30')) AS before, EXTRACT(YEAR FROM AGE(DATE '2026-10-30',DATE '2001-10-30')) AS birthday, EXTRACT(YEAR FROM AGE(DATE '2025-02-28',DATE '2000-02-29')) AS leapbefore, EXTRACT(YEAR FROM AGE(DATE '2025-03-01',DATE '2000-02-29')) AS leapafter")).toEqual([{ before: 24, birthday: 25, leapbefore: 24, leapafter: 25 }]);
});
