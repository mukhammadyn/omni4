import { useMemo, useState, type ReactNode } from "react";
import {
  BriefcaseBusinessIcon,
  Building2Icon,
  LandmarkIcon,
  MapPinIcon,
  UsersIcon,
  type LucideIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  Avatar,
  OrgChart,
  OrgLegendItem,
  buildTree,
  colorOf,
  type Item,
  type OrgNode,
} from "@/features/item";
import type { TranslationKey } from "@/shared/lib/i18n";
import { CHIP_STYLES, hexToChipColor, type ChipColor } from "@/shared/ui/chip";
import { Icon } from "@/shared/ui/icon";
import { Tabs } from "@/shared/ui/tabs";
import {
  departmentColors,
  toPerson,
  useOrgDirectory,
  type Department,
  type Person,
  type Unit,
} from "../api/org";

type Mode = "emp" | "dept" | "unit";

const MODES: { id: Mode; icon: LucideIcon; label: TranslationKey; hint: TranslationKey }[] = [
  { id: "emp", icon: UsersIcon, label: "org.mode.emp", hint: "org.hint.emp" },
  { id: "dept", icon: Building2Icon, label: "org.mode.dept", hint: "org.hint.dept" },
  { id: "unit", icon: LandmarkIcon, label: "org.mode.unit", hint: "org.hint.unit" },
];

/** Ступени организации — `UT` прототипа: свой значок и цвет у каждой. */
const KINDS: Record<Unit["kind"], { icon: LucideIcon; color: ChipColor; label: TranslationKey }> = {
  entity: { icon: LandmarkIcon, color: "gray", label: "org.kind.entity" },
  unit: { icon: BriefcaseBusinessIcon, color: "purple", label: "org.kind.unit" },
  location: { icon: MapPinIcon, color: "green", label: "org.kind.location" },
};

type DeptNode = Department & { members: Person[]; tone: ChipColor };
type UnitNode = Unit & { count: number };

/**
 * «Оргструктура» сотрудников HRMS — `drawOrg` прототипа: три дерева
 * на одном холсте.
 *
 *   Сотрудники   — руководитель → подчинённые (`employees.employees_id`);
 *   Отделы       — отдел → подотдел (`departments.departments_id`),
 *                  на узле руководитель и аватары людей ветки;
 *   Организация  — юрлицо → бизнес-юнит → локация, на узле число людей.
 *                  Регионов узлами нет: у локации это вариант поля
 *                  `region`, а не запись.
 *
 * Люди — строки экрана: отбор и поиск view сужают все три дерева.
 * Справочники — целиком (api/org).
 */
export function OrgStructure({
  rows,
  total,
  pending,
  onOpenRow,
}: {
  rows: Item[];
  /** Сколько людей всего, по ответу сервера. */
  total: number;
  /** Порции ещё догружаются: дерево ждёт, на экране — сколько пришло. */
  pending: boolean;
  onOpenRow: (guid: string) => void;
}) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<Mode>("emp");
  const directory = useOrgDirectory({ units: mode === "unit" });
  const people = useMemo(() => rows.map(toPerson), [rows]);
  const deptColor = useMemo(
    () => departmentColors(directory.departments, colorOf),
    [directory.departments],
  );

  /*
   * Деревья — памяткой: экран перерисовывается часто (наведение,
   * карточка, набор в поиске), а дерево меняется только с данными.
   * Строится одно — то, что открыто.
   */
  const empRoots = useMemo(
    () =>
      mode === "emp"
        ? buildTree(
            people,
            (person) => person.id,
            (person) => person.managerId,
          )
        : [],
    [mode, people],
  );

  const deptRoots = useMemo(() => {
    if (mode !== "dept") return [];
    const byDept = new Map<string, Person[]>();
    for (const person of people) {
      byDept.set(person.departmentId, [...(byDept.get(person.departmentId) ?? []), person]);
    }
    /* Люди ветки — свои и всех подотделов, как `deptAll` прототипа. */
    const toNode = (node: OrgNode<Department>): OrgNode<DeptNode> => {
      const kids = node.kids.map(toNode);
      return {
        id: node.id,
        kids,
        data: {
          ...node.data,
          members: [...(byDept.get(node.id) ?? []), ...kids.flatMap((kid) => kid.data.members)],
          tone: deptColor.get(node.id) ?? "gray",
        },
      };
    };
    return buildTree(
      directory.departments,
      (dept) => dept.id,
      (dept) => dept.parentId,
    ).map(toNode);
  }, [mode, people, directory.departments, deptColor]);

  const unitRoots = useMemo(() => {
    if (mode !== "unit") return [];
    const byLocation = new Map<string, number>();
    for (const person of people) {
      byLocation.set(person.locationId, (byLocation.get(person.locationId) ?? 0) + 1);
    }
    /* Людей считают локации; выше — сумма веток. */
    const toNode = (node: OrgNode<Unit>): OrgNode<UnitNode> => {
      const kids = node.kids.map(toNode);
      const own = node.data.kind === "location" ? (byLocation.get(node.id) ?? 0) : 0;
      const count = own + kids.reduce((sum, kid) => sum + kid.data.count, 0);
      return { id: node.id, kids, data: { ...node.data, count } };
    };
    return buildTree(
      directory.units,
      (unit) => unit.id,
      (unit) => unit.parentId,
    ).map(toNode);
  }, [mode, people, directory.units]);

  const openHead = (headId: string) => {
    if (headId) onOpenRow(headId);
  };

  const head = ({ headName, headPhoto }: { headName: string; headPhoto: string }) =>
    headName ? (
      <span className="inline-flex min-w-0 items-center gap-1.5">
        <Avatar name={headName} photo={headPhoto} size="sm" />
        <span className="truncate">{headName}</span>
      </span>
    ) : null;

  const bar = (
    <>
      <Tabs
        variant="segment"
        activeId={mode}
        onSelect={(id) => setMode(id as Mode)}
        tabs={MODES.map((item) => ({ id: item.id, label: t(item.label), icon: item.icon }))}
      />
      <span className="text-xs text-fg-subtle max-md:hidden">
        {t(MODES.find((item) => item.id === mode)!.hint)}
      </span>
      {!pending && total > rows.length && (
        <span className="text-xs text-fg-muted">{t("org.truncated", { count: rows.length })}</span>
      )}
    </>
  );

  if (pending) {
    return (
      <p className="grid flex-1 place-items-center p-8 text-sm text-fg-muted">
        {t("org.loading", { loaded: rows.length, total })}
      </p>
    );
  }

  if (mode === "emp") {
    const colorOfPerson = (person: Person) =>
      person.departmentId
        ? (deptColor.get(person.departmentId) ?? colorOf(person.department))
        : "gray";
    const legend = new Map(
      people.filter((person) => person.department).map((person) => [person.department, colorOfPerson(person)]),
    );

    return (
      <OrgChart
        key={mode}
        roots={empRoots}
        collapseFrom={1}
        toolbar={bar}
        colorOf={(node) => colorOfPerson(node.data)}
        onOpen={(node) => onOpenRow(node.id)}
        legend={[...legend].map(([label, color]) => (
          <OrgLegendItem key={label} color={color} label={label} />
        ))}
        renderNode={({ data }) => (
          <div className="flex items-center gap-2.5">
            <Avatar name={data.name} photo={data.photo} size="lg" />
            <Lines
              title={data.name}
              sub={[data.position, data.department].filter(Boolean).join(" · ")}
            />
          </div>
        )}
      />
    );
  }

  /*
   * Справочник не дали — отказ словами сервера и «Повторить», как
   * у строк экрана. Пустое дерево здесь врало бы: «отделов нет» и
   * «читать отделы нельзя» — разные вещи.
   */
  if (directory.error) {
    return (
      <div className="flex min-h-0 flex-1 flex-col px-6">
        <div className="flex shrink-0 flex-wrap items-center gap-2.5 pt-2.5 pb-2">{bar}</div>
        <div className="grid flex-1 place-items-center p-8 text-center">
          <div className="flex max-w-sm flex-col items-center gap-3">
            <p className="text-sm text-fg-muted">{directory.error}</p>
            <button
              type="button"
              onClick={directory.refetch}
              className="h-8 rounded-md border border-border-strong px-3 text-sm text-fg transition-colors hover:bg-surface-hover"
            >
              {t("action.retry")}
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* Вписывание мерит дерево при открытии: пустое вписалось бы в 100%. */
  if (directory.isLoading) return null;

  if (mode === "dept") {
    return (
      <OrgChart
        key={mode}
        roots={deptRoots}
        autoFit
        toolbar={bar}
        colorOf={(node) => node.data.tone}
        onOpen={(node) => openHead(node.data.headId)}
        legend={<span>{t("org.legend.dept")}</span>}
        renderNode={(node) => (
          <>
            <div className="flex items-center gap-2.5">
              <Tile icon={node.kids.length ? Building2Icon : UsersIcon} color={node.data.tone} />
              <Lines
                title={node.data.name}
                sub={t("org.people", { count: node.data.members.length })}
              />
            </div>
            <Meta>
              {head(node.data)}
              <Stack people={node.data.members} />
            </Meta>
          </>
        )}
      />
    );
  }

  return (
    <OrgChart
      key={mode}
      roots={unitRoots}
      autoFit
      toolbar={bar}
      colorOf={(node) =>
        node.data.color ? hexToChipColor(node.data.color) : KINDS[node.data.kind].color
      }
      onOpen={(node) => openHead(node.data.headId)}
      legend={Object.values(KINDS).map((kind) => (
        <OrgLegendItem key={kind.label} color={kind.color} label={t(kind.label)} />
      ))}
      renderNode={({ data }) => {
        const kind = KINDS[data.kind];
        const color = data.color ? hexToChipColor(data.color) : kind.color;
        const info =
          data.kind === "entity" && data.info ? t("org.inn", { inn: data.info }) : data.info;

        return (
          <>
            <span className="mb-1.5 block text-[10.5px] font-bold tracking-[0.5px] text-fg-muted uppercase">
              {t(kind.label)}
            </span>
            <div className="flex items-center gap-2.5">
              <Tile icon={kind.icon} color={color} />
              <Lines title={data.name} sub={info} />
            </div>
            <Meta>
              {head(data) ?? <span />}
              <span className="inline-flex shrink-0 items-center gap-1 font-semibold">
                <Icon as={UsersIcon} size={13} />
                {data.count}
              </span>
            </Meta>
          </>
        );
      }}
    />
  );
}

function Lines({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="min-w-0">
      <b className="block truncate text-[13.5px] font-semibold">{title || "—"}</b>
      {sub && <small className="block truncate text-xs text-fg-muted">{sub}</small>}
    </div>
  );
}

/** Значок узла — `.on-ic` прототипа: квадрат 32px цвета ветки. */
function Tile({ icon, color }: { icon: LucideIcon; color: ChipColor }) {
  return (
    <span className={`grid size-8 shrink-0 place-items-center rounded-[8px] ${CHIP_STYLES[color]}`}>
      <Icon as={icon} size={16} />
    </span>
  );
}

/** Нижняя строка узла — `.on-meta`: руководитель слева, люди справа. */
function Meta({ children }: { children: ReactNode }) {
  return (
    <div className="mt-2 flex items-center justify-between gap-1.5 border-t border-border pt-2 text-xs text-fg-muted">
      {children}
    </div>
  );
}

/** Пять аватаров внахлёст и «+N» — `.on-stack`. */
function Stack({ people }: { people: Person[] }) {
  if (!people.length) return null;
  return (
    <span className="flex shrink-0 pl-1.5 [&>*]:-ml-1.5 [&>*]:ring-2 [&>*]:ring-surface">
      {people.slice(0, 5).map((person) => (
        <Avatar key={person.id} name={person.name} photo={person.photo} size="sm" />
      ))}
      {people.length > 5 && (
        <span className="grid h-5 min-w-5 place-items-center rounded-full bg-surface-active px-1 text-[9px] font-semibold text-fg-muted">
          +{people.length - 5}
        </span>
      )}
    </span>
  );
}
