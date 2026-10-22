import { useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  ArrowRightIcon,
  BanknoteIcon,
  ClockIcon,
  Columns3Icon,
  CopyIcon,
  EllipsisIcon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";
import { toast } from "@/shared/lib/toast";
import { Button } from "@/shared/ui/button";
import { CHIP_DOT, CHIP_STYLES, hexToChipColor } from "@/shared/ui/chip";
import { ConfirmDialog } from "@/shared/ui/confirm-dialog";
import { DatePicker } from "@/shared/ui/date-picker";
import { Dropdown } from "@/shared/ui/dropdown";
import { Icon } from "@/shared/ui/icon";
import { Popover, PopoverItem, PopoverSeparator } from "@/shared/ui/popover";
import {
  useGradeMatrix,
  useMatrixActions,
  useMatrixOptions,
  useMatrixVersions,
  type CellValue,
  type Direction,
  type MatrixCell,
  type MatrixColumn,
  type MatrixRow,
  type Option,
} from "../api/grade-matrix";

/* Закреплённые ячейки — непрозрачные: `surface-hover` полупрозрачный,
   и под шапкой и левой колонкой просвечивали бы прокрученные ячейки. */
const SOLID_HOVER = "bg-surface bg-[linear-gradient(var(--color-surface-hover),var(--color-surface-hover))]";

const money = (n: number | null, locale: string) => (n == null ? "" : Math.round(n).toLocaleString(locale).replace(/,/g, " "));
const digits = (s: string) => {
  const clean = s.replace(/[^\d]/g, "");
  return clean ? Number(clean) : null;
};

/** Стаж словами — как в прототипе: «0 мес», «6 мес», «1 год», «1,5 года», «5 лет». */
export function tenure(months: number | null, locale: string, t: (key: TenureKey, o: { n: string }) => string) {
  if (months == null) return "";
  if (months < 12) return t("gm.months", { n: String(months) });
  const years = months / 12;
  const n = Number.isInteger(years) ? String(years) : years.toFixed(1).replace(".", ",");
  /* Дробные годы — «1,5 года»: форма как у «few». */
  const form = Number.isInteger(years) ? new Intl.PluralRules(locale).select(years) : "few";
  return t(`gm.years.${form === "one" || form === "few" || form === "many" ? form : "other"}`, { n });
}
type TenureKey = "gm.months" | "gm.years.one" | "gm.years.few" | "gm.years.many" | "gm.years.other";

/** Ступени прототипа — стаж от нуля до пяти лет. */
const STARTER = [0, 6, 12, 24, 36, 48, 60];

/**
 * «Зарплаты по грейдам» — матрица `gmInit` прототипа (settings.html#hr-salary):
 * версии, ступени со стажем и потолком (UZS, USD по курсу), направления
 * с критериями и должности с грейдом в каждой ступени. Правится по месту,
 * каждая ячейка сохраняется сама.
 */
export function GradeMatrix() {
  const { t } = useTranslation();
  const { versions, loading } = useMatrixVersions();
  const actions = useMatrixActions();
  const [picked, setPicked] = useState("");
  const current = versions.find((v) => v.id === picked) ?? versions.find((v) => v.published) ?? versions[0];

  if (loading) return <p className="py-6 text-sm text-fg-subtle">{t("common.loading")}</p>;
  if (!current)
    return (
      <div className="flex flex-col items-start gap-3 rounded-xl border border-border p-6">
        <p className="text-sm text-fg-muted">{t("gm.empty")}</p>
        <Button onClick={() => void actions.createVersion(t("gm.mainName"), 0).then(setPicked)}>
          <Icon as={PlusIcon} size={14} />
          {t("gm.create")}
        </Button>
      </div>
    );

  return <MatrixEditor key={current.id} version={current} versions={versions} onPick={setPicked} />;
}

function MatrixEditor({
  version,
  versions,
  onPick,
}: {
  version: ReturnType<typeof useMatrixVersions>["versions"][number];
  versions: ReturnType<typeof useMatrixVersions>["versions"];
  onPick: (id: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const matrix = useGradeMatrix(version.id);
  const options = useMatrixOptions();
  const actions = useMatrixActions();
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [hover, setHover] = useState("");
  const { columns, directions } = matrix;
  const n = columns.length;
  /* После удаления из середины порядки с дырами: новая — за последней, а не на n. */
  const nextOrder = columns.reduce((max, c) => Math.max(max, c.order), -1) + 1;
  const order = versions.length;

  const run = (job: () => Promise<unknown>, done?: string) => {
    setBusy(true);
    void job()
      .then(() => done && toast.success(done))
      .catch(() => undefined)
      .finally(() => setBusy(false));
  };

  const usedDepartments = new Set(directions.map((d) => d.departmentId));
  const top = `sticky top-0 z-2 border-b border-r border-border ${SOLID_HOVER}`;
  const side = "sticky left-0 z-1 min-w-[300px] max-w-[300px] border-b border-r border-border bg-surface px-3 text-left font-medium";
  const cell = (columnId: string) => `h-[34px] min-w-[118px] border-b border-r border-border p-0 last:border-r-0 ${hover === columnId ? "bg-accent-subtle/40" : ""}`;

  return (
    <div className="flex min-w-0 flex-col gap-3 pb-6">
      {/* Одна панель: версия и её статус, дата, добавление, прочее — в меню. */}
      <div className="flex flex-wrap items-center gap-2">
        {renaming ? (
          <CellInput
            autoFocus
            className="h-(--spacing-control) w-60 rounded-md border border-accent bg-input px-2.5 text-left text-sm"
            value={version.name}
            onCommit={(name) => name && void actions.updateVersion(version.id, { name })}
            onDone={() => setRenaming(false)}
          />
        ) : (
          <div className="w-60">
            <Dropdown size="control" value={version.id} items={versions.map((v) => ({ value: v.id, label: v.name }))} onChange={onPick} />
          </div>
        )}
        <div className="w-44">
          <DatePicker
            value={version.from}
            locale={i18n.language}
            placeholder={t("gm.from")}
            ariaLabel={t("gm.from")}
            className="h-(--spacing-control)"
            onChange={(from) => void actions.updateVersion(version.id, { effective_from: from || null })}
          />
        </div>
        <span className="flex-1" />
        <button
          type="button"
          title={t(version.published ? "gm.unpublishHint" : "gm.publishHint")}
          onClick={() =>
            /* Без даты версия в проверке неотличима от другой такой же — публикуется с датой. */
            !version.published && !version.from
              ? toast.error(t("gm.needDate"))
              : void actions.updateVersion(version.id, { is_active: !version.published })
          }
          className={`inline-flex h-(--spacing-control) items-center gap-1.5 rounded-full px-2.5 text-xs font-medium transition-opacity hover:opacity-80 ${
            CHIP_STYLES[version.published ? "green" : "yellow"]
          }`}
        >
          <span className={`size-1.5 rounded-full ${CHIP_DOT[version.published ? "green" : "yellow"]}`} />
          {t(version.published ? "gm.published" : "gm.statusDraft")}
        </button>
        {n > 0 && (
          <Button variant="secondary" size="sm" disabled={busy} onClick={() => run(() => actions.addColumn(version.id, String(n + 1), nextOrder), t("gm.columnAdded"))}>
            <Icon as={PlusIcon} size={14} />
            {t("gm.addColumn")}
          </Button>
        )}
        <Popover
          align="end"
          trigger={({ toggle }) => (
            <Button variant="secondary" size="sm" disabled={busy || !n} onClick={toggle}>
              <Icon as={PlusIcon} size={14} />
              {t("gm.addDirection")}
            </Button>
          )}
        >
          {(close) => (
            <OptionList
              options={options.departments.filter((d) => !usedDepartments.has(d.id))}
              placeholder={t("gm.pickDepartment")}
              onPick={(id) => (close(), run(() => actions.addDirection(version.id, id, directions.length), t("gm.directionAdded")))}
            />
          )}
        </Popover>
        <Popover
          align="end"
          trigger={({ toggle }) => (
            <Button variant="ghost" size="sm" aria-label={t("gm.more")} onClick={toggle}>
              <Icon as={EllipsisIcon} size={16} />
            </Button>
          )}
        >
          {(close) => (
            <>
              <PopoverItem icon={<Icon as={PencilIcon} size={14} />} onClick={() => (close(), setRenaming(true))}>
                {t("gm.rename")}
              </PopoverItem>
              <PopoverItem
                icon={<Icon as={CopyIcon} size={14} />}
                onClick={() => {
                  close();
                  run(
                    () => actions.copyVersion(version, columns, directions, t("gm.copyName", { name: version.name }), order).then(onPick),
                    t("gm.copied"),
                  );
                }}
              >
                {t("gm.copy")}
              </PopoverItem>
              <PopoverItem
                icon={<Icon as={PlusIcon} size={14} />}
                onClick={() => (close(), run(() => actions.createVersion(t("gm.newName", { n: order + 1 }), order).then(onPick), t("gm.created")))}
              >
                {t("gm.newVersion")}
              </PopoverItem>
              <PopoverSeparator />
              <PopoverItem danger icon={<Icon as={Trash2Icon} size={14} />} onClick={() => (close(), setDeleting(true))}>
                {t("gm.deleteVersion")}
              </PopoverItem>
            </>
          )}
        </Popover>
      </div>

      {!n && !matrix.loading && (
        <div className="flex flex-col items-center gap-3 rounded-[10px] border border-dashed border-border-strong px-6 py-10 text-center">
          <span className="grid size-10 place-items-center rounded-xl bg-accent-subtle text-accent-text">
            <Icon as={Columns3Icon} size={18} />
          </span>
          <div>
            <b className="block text-sm font-semibold">{t("gm.startTitle")}</b>
            <p className="mt-1 max-w-md text-sm text-fg-muted">{t("gm.startHint")}</p>
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            <Button
              disabled={busy}
              onClick={() =>
                run(async () => {
                  for (const [i, months] of STARTER.entries()) await actions.addColumn(version.id, String(i + 1), i, months);
                }, t("gm.starterDone"))
              }
            >
              {t("gm.starter")}
            </Button>
            <Button variant="secondary" disabled={busy} onClick={() => run(() => actions.addColumn(version.id, "1", 0), t("gm.columnAdded"))}>
              {t("gm.addOne")}
            </Button>
          </div>
        </div>
      )}

      {n > 0 && (
      <div className="max-h-[calc(100vh-300px)] w-fit max-w-full overflow-auto rounded-[10px] border border-border" onMouseLeave={() => setHover("")}>
        <table className="border-separate border-spacing-0 text-[13px]">
          <thead>
            <tr>
              <th className={`${side} ${top} z-3 text-xs text-fg-muted`}>{t("gm.level")}</th>
              {columns.map((column) => (
                <th key={column.id} className={`${top} group h-[34px] min-w-[118px] p-0 last:border-r-0`} onMouseEnter={() => setHover(column.id)}>
                  <div className="relative flex items-center">
                    <CellInput
                      className="text-sm font-semibold"
                      value={column.label}
                      onCommit={(label) => label && void actions.updateColumn(column.id, { label })}
                    />
                    <button
                      type="button"
                      aria-label={t("gm.deleteColumn")}
                      onClick={() => run(() => actions.removeColumn(column.id, directions), t("gm.columnDeleted"))}
                      className="absolute right-0.5 hidden size-4.5 place-items-center rounded text-fg-subtle group-hover:grid hover:bg-danger-subtle hover:text-danger"
                    >
                      <Icon as={XIcon} size={12} />
                    </button>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <th className={`${side} ${SOLID_HOVER}`}>
                <SideLabel icon={<Icon as={ClockIcon} size={14} />}>{t("gm.period")}</SideLabel>
              </th>
              {columns.map((column) => (
                <td key={column.id} className={`${cell(column.id)} ${SOLID_HOVER}`} onMouseEnter={() => setHover(column.id)}>
                  <MonthsInput column={column} onCommit={(months) => void actions.updateColumn(column.id, { min_tenure_months: months })} />
                </td>
              ))}
            </tr>
            <tr>
              <th className={side}>
                <SideLabel icon={<Icon as={BanknoteIcon} size={14} />}>
                  {t("gm.maxSalary")} <b className={`rounded px-1.5 text-[11px] ${CHIP_STYLES.green}`}>UZS</b>
                </SideLabel>
              </th>
              {columns.map((column) => (
                <td key={column.id} className={cell(column.id)} onMouseEnter={() => setHover(column.id)}>
                  <CellInput
                    className="font-semibold tabular-nums"
                    value={money(column.maxSalary, i18n.language)}
                    onCommit={(raw) => void actions.updateColumn(column.id, { max_salary: digits(raw) })}
                  />
                </td>
              ))}
            </tr>
            <tr>
              <th className={side}>
                <SideLabel icon={<Icon as={BanknoteIcon} size={14} />}>
                  {t("gm.maxSalary")} <b className={`rounded px-1.5 text-[11px] ${CHIP_STYLES.blue}`}>USD</b>
                  <span className="ml-auto inline-flex shrink-0 items-center gap-1.5 text-xs font-normal text-fg-muted" title={t("gm.rateHint")}>
                    {t("gm.rate")}
                    <CellInput
                      className="h-6! w-20! min-w-20! rounded border border-border-strong bg-input! px-1.5! text-right text-[12px] font-medium text-fg tabular-nums"
                      placeholder="—"
                      value={money(version.usdRate, i18n.language)}
                      allowEmpty
                      onCommit={(raw) => void actions.updateVersion(version.id, { usd_rate: digits(raw) })}
                    />
                  </span>
                </SideLabel>
              </th>
              {columns.map((column) => (
                <td key={column.id} className={`${cell(column.id)} text-center text-fg-muted tabular-nums`} onMouseEnter={() => setHover(column.id)}>
                  {column.maxSalary != null && version.usdRate ? money(column.maxSalary / version.usdRate, i18n.language) : "—"}
                </td>
              ))}
            </tr>

            {directions.map((direction) => (
              <DirectionRows
                key={direction.id}
                direction={direction}
                columns={columns}
                options={options}
                side={side}
                cell={cell}
                onHover={setHover}
                onAddPosition={(positionId) =>
                  run(() => actions.addPosition(version.id, direction.id, positionId, direction.positions.length), t("gm.positionAdded"))
                }
                onRename={(name) => void actions.updateRow(direction.id, { name: name || null })}
                onRemove={(row, children) => run(() => actions.removeRow(row, children), t("gm.rowDeleted"))}
                onCell={(row, columnId, value) => void actions.setCell(row, columnId, value)}
              />
            ))}
          </tbody>
        </table>
      </div>
      )}
      {n > 0 && !directions.length && !matrix.loading && <p className="text-sm text-fg-subtle">{t("gm.noDirections")}</p>}

      {n > 0 && (
<div className="flex items-center gap-2.5 text-xs text-fg-subtle">
        {t("gm.summary", {
          levels: n,
          positions: directions.reduce((sum, d) => sum + d.positions.length, 0),
        })}
        <span className="flex-1" />
        {t("gm.autosave")}
      </div>
)}

      {deleting && (
        <ConfirmDialog
          title={t("gm.deleteVersion")}
          description={t("gm.deleteVersionHint", { name: version.name })}
          confirmLabel={t("action.delete")}
          busy={busy}
          onClose={() => setDeleting(false)}
          onConfirm={() =>
            run(async () => {
              await actions.removeVersion(version.id, columns, directions);
              setDeleting(false);
              onPick("");
            }, t("gm.versionDeleted"))
          }
        />
      )}
    </div>
  );
}

function SideLabel({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <span className="flex w-full items-center gap-1.5 whitespace-nowrap">
      <span className="text-fg-subtle">{icon}</span>
      {children}
    </span>
  );
}

/** Направление: строка с критериями по ступеням и его должности. */
function DirectionRows({
  direction,
  columns,
  options,
  side,
  cell,
  onHover,
  onAddPosition,
  onRename,
  onRemove,
  onCell,
}: {
  direction: Direction;
  columns: MatrixColumn[];
  options: ReturnType<typeof useMatrixOptions>;
  side: string;
  cell: (columnId: string) => string;
  onHover: (columnId: string) => void;
  onAddPosition: (positionId: string) => void;
  onRename: (name: string) => void;
  onRemove: (row: MatrixRow, children?: MatrixRow[]) => void;
  onCell: (row: MatrixRow, columnId: string, value: CellValue) => void;
}) {
  const { t } = useTranslation();
  const tone = direction.color ? hexToChipColor(direction.color) : "gray";
  const used = new Set(direction.positions.map((p) => p.positionId));
  const iconButton = "grid size-5.5 shrink-0 place-items-center rounded text-fg-subtle opacity-0 group-hover:opacity-100 hover:bg-surface-hover hover:text-fg";

  /* Объединение по вертикали: соседние ячейки с одной должностью роста —
     одна ячейка, как в прототипе (Backend…Design → CTO). */
  const span = (ri: number, columnId: string) => {
    const target = direction.positions[ri]?.cells.get(columnId)?.positionId;
    if (!target) return 1;
    let k = 1;
    while (direction.positions[ri + k]?.cells.get(columnId)?.positionId === target) k++;
    return k;
  };
  const covered = (ri: number, columnId: string) => {
    const target = direction.positions[ri]?.cells.get(columnId)?.positionId;
    return !!target && direction.positions[ri - 1]?.cells.get(columnId)?.positionId === target;
  };

  return (
    <>
      <tr className="group">
        <th className={`${side} border-l-[3px] ${CHIP_STYLES[tone]}`} style={{ borderLeftColor: "currentColor" }}>
          <div className="flex items-center gap-1.5 text-fg">
            <span className={`size-2 shrink-0 rounded-full ${CHIP_DOT[tone]}`} />
            <CellInput className="flex-1 px-1 text-left font-semibold" value={direction.name} onCommit={onRename} allowEmpty />
            <Popover
              align="end"
              trigger={({ toggle }) => (
                <button type="button" aria-label={t("gm.addPosition")} onClick={toggle} className={iconButton}>
                  <Icon as={PlusIcon} size={13} />
                </button>
              )}
            >
              {(close) => (
                <OptionList
                  options={options.positions.filter((p) => !used.has(p.id))}
                  placeholder={t("gm.pickPosition")}
                  onPick={(id) => (close(), onAddPosition(id))}
                />
              )}
            </Popover>
            <button type="button" aria-label={t("gm.deleteDirection")} onClick={() => onRemove(direction, direction.positions)} className={iconButton}>
              <Icon as={Trash2Icon} size={13} />
            </button>
          </div>
        </th>
        {columns.map((column) => (
          <td key={column.id} className={`${cell(column.id)} ${CHIP_STYLES[tone]}`} onMouseEnter={() => onHover(column.id)}>
            <CellInput
              className="text-xs text-fg-muted italic"
              placeholder={t("gm.criterion")}
              value={direction.cells.get(column.id)?.text ?? ""}
              allowEmpty
              onCommit={(text) => onCell(direction, column.id, { text })}
            />
          </td>
        ))}
      </tr>
      {direction.positions.map((position, ri) => (
        <tr key={position.id} className="group">
          <th className={`${side} pl-6 font-normal`}>
            <div className="flex items-center gap-1.5">
              <span className="flex-1 truncate">{position.name || "—"}</span>
              <button type="button" aria-label={t("gm.deletePosition")} onClick={() => onRemove(position)} className={iconButton}>
                <Icon as={Trash2Icon} size={13} />
              </button>
            </div>
          </th>
          {columns.map((column) =>
            covered(ri, column.id) ? null : (
              <td
                key={column.id}
                rowSpan={span(ri, column.id)}
                className={`${cell(column.id)} align-middle`}
                onMouseEnter={() => onHover(column.id)}
              >
                <GradeCell
                  name={t("gm.cellLabel", { position: position.name, level: column.label })}
                  value={position.cells.get(column.id)}
                  tone={tone}
                  options={options}
                  onPick={(value) => {
                    /* Объединённая ячейка правится целиком: значение уходит во все её строки.
                       ponytail: расклеить — очистить и проставить по одной, как в прототипе. */
                    const rows = direction.positions.slice(ri, ri + span(ri, column.id));
                    for (const row of rows) onCell(row, column.id, value);
                  }}
                />
              </td>
            ),
          )}
        </tr>
      ))}
    </>
  );
}

/** Ячейка должности: грейд, должность роста или пусто — выбором из списка. */
function GradeCell({
  value,
  tone,
  options,
  name,
  onPick,
}: {
  value: MatrixCell | undefined;
  /** Подпись для читалки: «PM, ступень 3». */
  name: string;
  tone: ReturnType<typeof hexToChipColor>;
  options: ReturnType<typeof useMatrixOptions>;
  onPick: (value: CellValue) => void;
}) {
  const { t } = useTranslation();
  const grade = value?.gradeId ? (options.grades.find((g) => g.id === value.gradeId)?.name ?? value.grade) : "";
  const label = grade || value?.position || value?.text || "";

  return (
    <Popover
      className="h-full"
      trigger={({ toggle }) => (
        <button type="button" onClick={toggle} aria-label={name} className="flex h-full w-full items-center justify-center px-1.5">
          {label ? (
            <span className={`inline-flex h-6 min-w-[60px] items-center justify-center gap-1 rounded-[5px] px-2 font-semibold ${CHIP_STYLES[tone]}`}>
              {value?.positionId && <Icon as={ArrowRightIcon} size={12} />}
              {label}
            </span>
          ) : (
            <span className="text-fg-subtle">—</span>
          )}
        </button>
      )}
    >
      {(close) => (
        <OptionList
          groups={[
            { title: t("gm.grades"), options: options.grades, kind: "grade" },
            { title: t("gm.growInto"), options: options.positions, kind: "position" },
          ]}
          placeholder={t("gm.pickGrade")}
          {...(label ? { onClear: () => (close(), onPick({})) } : {})}
          onPick={(id, kind) => (close(), onPick(kind === "position" ? { positionId: id } : { gradeId: id }))}
        />
      )}
    </Popover>
  );
}

/** Список с поиском — для отдела, должности и грейда. */
function OptionList({
  options,
  groups,
  placeholder,
  onPick,
  onClear,
}: {
  options?: Option[];
  groups?: { title: string; options: Option[]; kind: string }[];
  placeholder: string;
  onPick: (id: string, kind: string) => void;
  onClear?: () => void;
}) {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const q = search.trim().toLowerCase();
  const all = groups ?? [{ title: "", options: options ?? [], kind: "" }];

  return (
    <div className="flex max-h-80 w-64 flex-col">
      <label className="mb-1 flex h-7 shrink-0 items-center gap-1.5 rounded-md border border-border px-2 text-sm">
        <Icon as={SearchIcon} size={14} className="shrink-0 text-fg-subtle" />
        <input
          autoFocus
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={placeholder}
          className="min-w-0 flex-1 bg-transparent text-fg outline-none placeholder:text-fg-subtle"
        />
      </label>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {onClear && (
          <PopoverItem onClick={onClear} icon={<Icon as={XIcon} size={14} />}>
            {t("gm.clear")}
          </PopoverItem>
        )}
        {all.map((group) => {
          const shown = group.options.filter((o) => !q || o.name.toLowerCase().includes(q));
          if (!shown.length) return null;
          return (
            <div key={group.kind}>
              {group.title && <div className="px-2 pt-2 pb-1 text-2xs font-semibold tracking-wide text-fg-subtle uppercase">{group.title}</div>}
              {shown.map((o) => (
                <PopoverItem
                  key={o.id}
                  onClick={() => onPick(o.id, group.kind)}
                  icon={o.color ? <span className={`size-2 rounded-full ${CHIP_DOT[hexToChipColor(o.color)]}`} /> : undefined}
                >
                  {o.name}
                </PopoverItem>
              ))}
            </div>
          );
        })}
        {all.every((g) => !g.options.some((o) => !q || o.name.toLowerCase().includes(q))) && (
          <p className="px-2 py-2 text-xs text-fg-subtle">{t("gm.nothing")}</p>
        )}
      </div>
    </div>
  );
}

/**
 * Поле ячейки без рамки: отдаёт значение по Enter и уходу фокуса,
 * как CommitInput, но в виде ячейки таблицы.
 */
function CellInput({
  value,
  onCommit,
  onDone,
  className = "",
  placeholder,
  allowEmpty = false,
  autoFocus = false,
}: {
  value: string;
  onCommit: (value: string) => void;
  /** После ухода фокуса — закрыть правку, где поле временное. */
  onDone?: () => void;
  className?: string;
  placeholder?: string;
  allowEmpty?: boolean;
  autoFocus?: boolean;
}) {
  const [text, setText] = useState(value);
  /* Escape — отказ: потеря фокуса после него не сохраняет. */
  const cancelled = useRef(false);
  useEffect(() => setText(value), [value]);
  const commit = () => {
    onDone?.();
    if (cancelled.current) {
      cancelled.current = false;
      return setText(value);
    }
    const next = text.trim();
    if (next === value.trim()) return;
    if (!next && !allowEmpty) return setText(value);
    onCommit(next);
  };
  return (
    <input
      autoFocus={autoFocus}
      value={text}
      placeholder={placeholder}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") {
          cancelled.current = true;
          e.currentTarget.blur();
        }
      }}
      className={`h-[33px] w-full min-w-0 bg-transparent px-1.5 text-center text-fg outline-none placeholder:text-fg-subtle focus:rounded-[2px] focus:bg-surface focus:shadow-[inset_0_0_0_2px_var(--color-accent)] ${className}`}
    />
  );
}

/** Стаж ступени: показывается словами, правится числом месяцев. */
function MonthsInput({ column, onCommit }: { column: MatrixColumn; onCommit: (months: number | null) => void }) {
  const { t, i18n } = useTranslation();
  const [editing, setEditing] = useState(false);
  if (!editing)
    return (
      <button type="button" onClick={() => setEditing(true)} className="h-[33px] w-full text-fg-muted">
        {tenure(column.months, i18n.language, t) || <span className="text-fg-subtle">—</span>}
      </button>
    );
  return (
    <input
      autoFocus
      inputMode="numeric"
      defaultValue={column.months ?? ""}
      placeholder={t("gm.monthsHint")}
      onBlur={(e) => {
        setEditing(false);
        const months = digits(e.target.value);
        if (months !== column.months) onCommit(months);
      }}
      onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
      className="h-[33px] w-full bg-surface text-center text-fg tabular-nums shadow-[inset_0_0_0_2px_var(--color-accent)] outline-none"
    />
  );
}
