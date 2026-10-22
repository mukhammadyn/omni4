import { useMemo } from "react";
import { useCreateItem, useDeleteItems, useUpdateItem, type Item } from "@/features/item";
import type { Band } from "../model/job-history";
import { related, text } from "./org";
import { useAll } from "./timesheet";

/**
 * Матрица грейдов — `gmInit` прототипа (settings.html#hr-salary):
 * версия (`hr_grade_matrices`) → ступени-колонки со стажем и потолком
 * (`hr_grade_matrix_columns`) → направления и их должности
 * (`hr_grade_matrix_rows`, должность — строка с родителем) → ячейки
 * (`hr_grade_matrix_cells`): у направления критерий текстом, у должности
 * грейд или должность, в которую растут.
 *
 * Каскада у ucode нет: удаление версии, ступени и строки удаляет
 * их ячейки и строки здесь же.
 */
const MATRICES = "hr_grade_matrices";
const COLUMNS = "hr_grade_matrix_columns";
const ROWS = "hr_grade_matrix_rows";
const CELLS = "hr_grade_matrix_cells";

export type MatrixVersion = { id: string; name: string; published: boolean; from: string; usdRate: number | null; order: number };
export type MatrixColumn = { id: string; label: string; months: number | null; maxSalary: number | null; order: number };
export type MatrixCell = { id: string; gradeId: string; grade: string; positionId: string; position: string; text: string };
export type MatrixRow = {
  id: string;
  /** Пусто — направление, иначе должность этого направления. */
  parentId: string;
  name: string;
  departmentId: string;
  positionId: string;
  order: number;
  /** Ячейки по id ступени. */
  cells: Map<string, MatrixCell>;
};
export type Direction = MatrixRow & { positions: MatrixRow[]; color: string };

export type CellValue = { gradeId?: string; positionId?: string; text?: string };

const num = (value: unknown) => (typeof value === "number" ? value : value == null || value === "" ? null : Number(value));
const byOrder = (a: { order: number }, b: { order: number }) => a.order - b.order;

const toVersion = (row: Item): MatrixVersion => ({
  id: text(row.guid),
  name: text(row.name),
  published: row.is_active === true,
  from: text(row.effective_from).slice(0, 10),
  usdRate: num(row.usd_rate),
  order: num(row.sort_order) ?? 0,
});

/** Версии матрицы — для выбора на экране. */
export function useMatrixVersions() {
  const { rows, loading } = useAll(MATRICES, {}, false);
  const versions = useMemo(() => rows.map(toVersion).sort((a, b) => byOrder(a, b) || a.name.localeCompare(b.name)), [rows]);
  return { versions, loading };
}

/** Одна версия целиком: ступени, направления с должностями, ячейки. */
export function useGradeMatrix(matrixId: string) {
  const one = matrixId ? { hr_grade_matrices_id: { op: "is" as const, values: [matrixId] } } : {};
  const columnRows = useAll(matrixId ? COLUMNS : undefined, one, false);
  const rowRows = useAll(matrixId ? ROWS : undefined, one);
  /* Ячейки — по строкам этой версии; отбор по связи строки на стороне клиента. */
  const rowIds = useMemo(() => rowRows.rows.map((row) => text(row.guid)), [rowRows.rows]);
  const cellRows = useAll(rowIds.length ? CELLS : undefined, { hr_grade_matrix_rows_id: { op: "any", values: rowIds } });

  const columns = useMemo<MatrixColumn[]>(
    () =>
      columnRows.rows
        .map((row) => ({
          id: text(row.guid),
          label: text(row.label),
          months: num(row.min_tenure_months),
          maxSalary: num(row.max_salary),
          order: num(row.sort_order) ?? 0,
        }))
        .sort(byOrder),
    [columnRows.rows],
  );

  const directions = useMemo<Direction[]>(() => {
    const cellsOf = new Map<string, Map<string, MatrixCell>>();
    for (const row of cellRows.rows) {
      const rowId = text(row.hr_grade_matrix_rows_id);
      const map = cellsOf.get(rowId) ?? new Map<string, MatrixCell>();
      map.set(text(row.hr_grade_matrix_columns_id), {
        id: text(row.guid),
        gradeId: text(row.hr_grades_id),
        grade: text(related(row, "hr_grades_id").name),
        positionId: text(row.hr_positions_id),
        position: text(related(row, "hr_positions_id").name),
        text: text(row.text),
      });
      cellsOf.set(rowId, map);
    }
    const all = rowRows.rows.map((row) => {
      const department = related(row, "hr_departments_id");
      return {
        id: text(row.guid),
        parentId: text(row.hr_grade_matrix_rows_id),
        name: text(row.name) || text(department.name),
        departmentId: text(row.hr_departments_id),
        positionId: text(row.hr_positions_id),
        position: text(related(row, "hr_positions_id").name),
        color: text(department.color),
        order: num(row.sort_order) ?? 0,
        cells: cellsOf.get(text(row.guid)) ?? new Map<string, MatrixCell>(),
      };
    });
    return all
      .filter((row) => !row.parentId)
      .sort(byOrder)
      .map((direction) => ({
        ...direction,
        positions: all
          .filter((row) => row.parentId === direction.id)
          .map((row) => ({ ...row, name: row.position }))
          .sort(byOrder),
      }));
  }, [rowRows.rows, cellRows.rows]);

  return {
    columns,
    directions,
    loading: columnRows.loading || rowRows.loading || cellRows.loading,
    cellCount: cellRows.rows.length,
  };
}

/** Правка матрицы. Все действия — по одной строке, с каскадом на ячейки. */
export function useMatrixActions() {
  const createMatrix = useCreateItem(MATRICES);
  const updateMatrix = useUpdateItem(MATRICES);
  const removeMatrix = useDeleteItems(MATRICES);
  const createColumn = useCreateItem(COLUMNS);
  const updateColumn = useUpdateItem(COLUMNS);
  const removeColumns = useDeleteItems(COLUMNS);
  const createRow = useCreateItem(ROWS);
  const updateRow = useUpdateItem(ROWS);
  const removeRows = useDeleteItems(ROWS);
  const createCell = useCreateItem(CELLS);
  const updateCell = useUpdateItem(CELLS);
  const removeCells = useDeleteItems(CELLS);

  const cellIds = (rows: { cells: Map<string, MatrixCell> }[], columnId?: string) =>
    rows.flatMap((row) => [...row.cells.entries()].filter(([col]) => !columnId || col === columnId).map(([, cell]) => cell.id));

  return {
    createVersion: async (name: string, order: number) => {
      const guid = crypto.randomUUID();
      await createMatrix.mutateAsync({ guid, name, is_active: false, sort_order: order });
      return guid;
    },
    updateVersion: (id: string, values: Item) => updateMatrix.mutateAsync({ guid: id, values }),

    /** Копия версии: ступени, строки и ячейки с новыми id. */
    copyVersion: async (source: MatrixVersion, columns: MatrixColumn[], directions: Direction[], name: string, order: number) => {
      const guid = crypto.randomUUID();
      await createMatrix.mutateAsync({ guid, name, is_active: false, effective_from: source.from || null, usd_rate: source.usdRate, sort_order: order });
      const columnId = new Map<string, string>();
      for (const column of columns) {
        const id = crypto.randomUUID();
        columnId.set(column.id, id);
        await createColumn.mutateAsync({
          guid: id,
          hr_grade_matrices_id: guid,
          label: column.label,
          min_tenure_months: column.months,
          max_salary: column.maxSalary,
          sort_order: column.order,
        });
      }
      const copyCells = async (row: MatrixRow, rowId: string) => {
        for (const [col, cell] of row.cells)
          await createCell.mutateAsync({
            guid: crypto.randomUUID(),
            hr_grade_matrix_rows_id: rowId,
            hr_grade_matrix_columns_id: columnId.get(col),
            hr_grades_id: cell.gradeId || null,
            hr_positions_id: cell.positionId || null,
            text: cell.text || null,
          });
      };
      for (const direction of directions) {
        const dirId = crypto.randomUUID();
        await createRow.mutateAsync({
          guid: dirId,
          hr_grade_matrices_id: guid,
          name: direction.name,
          hr_departments_id: direction.departmentId || null,
          sort_order: direction.order,
        });
        await copyCells(direction, dirId);
        for (const position of direction.positions) {
          const posId = crypto.randomUUID();
          await createRow.mutateAsync({
            guid: posId,
            hr_grade_matrices_id: guid,
            hr_grade_matrix_rows_id: dirId,
            hr_positions_id: position.positionId || null,
            sort_order: position.order,
          });
          await copyCells(position, posId);
        }
      }
      return guid;
    },

    removeVersion: async (id: string, columns: MatrixColumn[], directions: Direction[]) => {
      const rows = directions.flatMap((d) => [d, ...d.positions]);
      const cells = cellIds(rows);
      if (cells.length) await removeCells.mutateAsync(cells);
      if (rows.length) await removeRows.mutateAsync(rows.map((row) => row.id));
      if (columns.length) await removeColumns.mutateAsync(columns.map((column) => column.id));
      await removeMatrix.mutateAsync([id]);
    },

    addColumn: (matrixId: string, label: string, order: number, months: number | null = null) =>
      createColumn.mutateAsync({ guid: crypto.randomUUID(), hr_grade_matrices_id: matrixId, label, sort_order: order, min_tenure_months: months }),
    updateColumn: (id: string, values: Item) => updateColumn.mutateAsync({ guid: id, values }),
    removeColumn: async (id: string, directions: Direction[]) => {
      const cells = cellIds(directions.flatMap((d) => [d, ...d.positions]), id);
      if (cells.length) await removeCells.mutateAsync(cells);
      await removeColumns.mutateAsync([id]);
    },

    addDirection: (matrixId: string, departmentId: string, order: number) =>
      createRow.mutateAsync({ guid: crypto.randomUUID(), hr_grade_matrices_id: matrixId, hr_departments_id: departmentId, sort_order: order }),
    addPosition: (matrixId: string, directionId: string, positionId: string, order: number) =>
      createRow.mutateAsync({
        guid: crypto.randomUUID(),
        hr_grade_matrices_id: matrixId,
        hr_grade_matrix_rows_id: directionId,
        hr_positions_id: positionId,
        sort_order: order,
      }),
    updateRow: (id: string, values: Item) => updateRow.mutateAsync({ guid: id, values }),
    removeRow: async (row: MatrixRow, children: MatrixRow[] = []) => {
      const rows = [row, ...children];
      const cells = cellIds(rows);
      if (cells.length) await removeCells.mutateAsync(cells);
      await removeRows.mutateAsync(rows.map((r) => r.id));
    },

    /**
     * Ячейка одна на строку × ступень: есть — правится, пустая — удаляется.
     * ponytail: уникальность держит экран, не база — две быстрые правки пустой
     * ячейки подряд могут создать две; экран покажет одну. Очередь правок, если всплывёт.
     */
    setCell: (row: MatrixRow, columnId: string, value: CellValue) => {
      const cell = row.cells.get(columnId);
      const values = { hr_grades_id: value.gradeId || null, hr_positions_id: value.positionId || null, text: value.text?.trim() || null };
      const empty = !values.hr_grades_id && !values.hr_positions_id && !values.text;
      if (cell) return empty ? removeCells.mutateAsync([cell.id]) : updateCell.mutateAsync({ guid: cell.id, values });
      if (empty) return Promise.resolve();
      return createCell.mutateAsync({ guid: crypto.randomUUID(), hr_grade_matrix_rows_id: row.id, hr_grade_matrix_columns_id: columnId, ...values });
    },
  };
}

/**
 * Допустимые грейды должностей — для сверки истории работы
 * (model/job-history, `gradeIssue`): ячейки с грейдом в строках должностей
 * опубликованных версий, потолок — ступени ячейки, версия — её «Действует с».
 */
/* ponytail: читает все версии и ячейки целиком — на матрицах в сотню ячеек
   это пустяк; вырастут — отбирать опубликованные версии на сервере. */
export function useMatrixBands(): Band[] {
  const matrices = useAll(MATRICES, {}, false);
  const columns = useAll(COLUMNS, {}, false);
  const rows = useAll(ROWS, {}, false);
  const cells = useAll(CELLS, {});
  return useMemo(() => {
    const published = new Map(
      matrices.rows.filter((row) => row.is_active === true).map((row) => [text(row.guid), text(row.effective_from).slice(0, 10)]),
    );
    const columnOf = new Map(columns.rows.map((row) => [text(row.guid), row]));
    const rowOf = new Map(rows.rows.map((row) => [text(row.guid), row]));
    const bands: Band[] = [];
    for (const cell of cells.rows) {
      const row = rowOf.get(text(cell.hr_grade_matrix_rows_id));
      const column = columnOf.get(text(cell.hr_grade_matrix_columns_id));
      const gradeId = text(cell.hr_grades_id);
      if (!row || !column || !gradeId || !text(row.hr_positions_id)) continue;
      const from = published.get(text(row.hr_grade_matrices_id));
      if (from === undefined) continue;
      bands.push({
        positionId: text(row.hr_positions_id),
        gradeId,
        gradeName: text(related(cell, "hr_grades_id").name),
        max: num(column.max_salary),
        from,
      });
    }
    return bands;
  }, [matrices.rows, columns.rows, rows.rows, cells.rows]);
}

export type Option = { id: string; name: string; color: string; parentId: string };

/** Что ставится в матрицу: грейды (в ячейку), должности, отделы (направлением). */
export function useMatrixOptions() {
  const grades = useAll("hr_grades", {}, false);
  const positions = useAll("hr_positions", {}, false);
  const departments = useAll("hr_departments", {}, false);
  return useMemo(() => {
    const toOption = (row: Item): Option => ({
      id: text(row.guid),
      name: text(row.name),
      color: text(row.color),
      parentId: text(row.hr_grades_id) || text(row.hr_departments_id),
    });
    /* «DEV D3» → «D3»: имя группы в начале названия лишнее — группа видна по строке.
       Без такого префикса («Junior 1») название остаётся целым. */
    const groupName = new Map(grades.rows.map((row) => [text(row.guid), text(row.name)]));
    const shortName = (row: Item) => {
      const name = text(row.name);
      const group = groupName.get(text(row.hr_grades_id)) ?? "";
      return group && name.startsWith(`${group} `) ? name.slice(group.length + 1) : name;
    };
    return {
      /* Группы грейдов («DEV», «PM») в ячейку не ставятся — только их грейды. */
      grades: grades.rows
        .filter((row) => row.is_active !== false && text(row.hr_grades_id))
        .sort((a, b) => (num(a.sort_order) ?? 0) - (num(b.sort_order) ?? 0))
        .map((row) => ({ ...toOption(row), name: shortName(row) })),
      positions: positions.rows.filter((row) => row.is_active !== false).map(toOption).sort((a, b) => a.name.localeCompare(b.name)),
      departments: departments.rows.map(toOption).sort((a, b) => a.name.localeCompare(b.name)),
    };
  }, [grades.rows, positions.rows, departments.rows]);
}
