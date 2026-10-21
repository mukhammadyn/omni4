import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  DownloadIcon,
  LinkIcon,
  LoaderCircleIcon,
  PrinterIcon,
  XIcon,
  ZoomInIcon,
  ZoomOutIcon,
  EyeIcon,
  FileIcon,
  FileImageIcon,
  FileSpreadsheetIcon,
  FileTextIcon,
  FolderIcon,
  FolderInputIcon,
  FolderOpenIcon,
  FolderPlusIcon,
  LayoutGridIcon,
  ListIcon,
  MoreVerticalIcon,
  ArrowDownIcon,
  ArrowUpIcon,
  CheckIcon,
  PencilIcon,
  SearchIcon,
  Trash2Icon,
  UploadCloudIcon,
  UploadIcon,
  UsersIcon,
  type LucideIcon,
} from "lucide-react";
import { Avatar, useFileMeta, useItems, useUploadFiles } from "@/features/item";
import { formatDate, todayInput } from "@/shared/lib/date-value";
import { fileKind, fileName } from "@/shared/lib/file-kind";
import { toast } from "@/shared/lib/toast";
import { Button } from "@/shared/ui/button";
import { CHIP_COLORS, CHIP_STYLES, type ChipColor } from "@/shared/ui/chip";
import { CommitInput } from "@/shared/ui/commit-input";
import { ConfirmDialog } from "@/shared/ui/confirm-dialog";
import { DatePicker } from "@/shared/ui/date-picker";
import { Dropdown } from "@/shared/ui/dropdown";
import { Icon } from "@/shared/ui/icon";
import { Input } from "@/shared/ui/input";
import { Modal } from "@/shared/ui/modal";
import { Popover, PopoverItem, PopoverSeparator } from "@/shared/ui/popover";
import { Tabs } from "@/shared/ui/tabs";
import {
  useAddDocuments,
  useDeleteFolder,
  useReorderFolders,
  useSaveFolder,
  useDeleteDocument,
  useDocuments,
  useMoveDocument,
  useUpdateDocument,
  type Doc,
  type DocFolder,
} from "../api/document";
import { EMPLOYEES } from "../api/employee";
import { text, useOrgDirectory } from "../api/org";
import { ALL } from "../api/vacancy-page";
import { expiry, splitUpload, UPLOAD_EXT, UPLOAD_MAX } from "../model/document";

/** Тип view экрана (FIXED_VIEW_TYPES). */
export const DOCUMENTS_VIEW = "DOCUMENTS";

/** Папка «Без папки» — документы без `hr_document_folders_id`. */
const NONE = "-";
/** Недавние на главной — как прототип. */
const RECENT = 9;

const ext = (doc: Doc) => {
  const name = fileName(doc.url);
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
};

/** Значок и цвет файла — `FT` прототипа. */
export function fileLook(doc: Doc): { icon: LucideIcon; color: ChipColor } {
  const e = ext(doc);
  if (e === "pdf") return { icon: FileTextIcon, color: "red" };
  if (e === "doc" || e === "docx") return { icon: FileTextIcon, color: "blue" };
  if (e === "xls" || e === "xlsx" || e === "csv") return { icon: FileSpreadsheetIcon, color: "green" };
  if (e === "html" || e === "htm") return { icon: FileTextIcon, color: "orange" };
  if (fileKind(doc.url) === "image") return { icon: FileImageIcon, color: "purple" };
  return { icon: FileIcon, color: "gray" };
}

function FileBadge({ doc }: { doc: Doc }) {
  const look = fileLook(doc);
  return (
    <span className={`inline-flex size-7 shrink-0 items-center justify-center rounded-md ${CHIP_STYLES[look.color]}`} title={ext(doc).toUpperCase()}>
      <Icon as={look.icon} size={15} />
    </span>
  );
}

/** Срок действия: «Истёк» красным, «До …» жёлтым за SOON_DAYS, иначе дата. */
function Expiry({ doc, locale, quiet }: { doc: Doc; locale: string; quiet?: boolean }) {
  const { t } = useTranslation();
  const state = expiry(doc.validUntil, todayInput());
  if (!doc.validUntil || (quiet && !state)) return quiet ? null : <>—</>;
  const day = formatDate(doc.validUntil, "date", locale) ?? doc.validUntil;
  if (!state) return <>{day}</>;
  return (
    <span className={`rounded px-1.5 py-0.5 text-xs whitespace-nowrap ${CHIP_STYLES[state === "expired" ? "red" : "yellow"]}`}>
      {state === "expired" ? t("doc.expired") : t("doc.until", { date: day })}
    </span>
  );
}

/**
 * «Документы» — `documents.html` прототипа и вкладка `#docs` сотрудника
 * (`employeeId`): папки или сотрудники, недавние файлы, поиск, сетка
 * и список; загрузка, новая папка, перенос и удаление. Сделан под
 * `hr_documents` (FIXED_VIEW_TYPES).
 *
 * Нет из прототипа: «Сгенерировать» по `hr_document_templates`
 * (шаблоны — .docx, подстановка нужна на сервере), подписи E-IMZO.
 */
export function DocumentBrowser({
  employeeId,
  locale,
  onOpenEmployee,
}: {
  employeeId?: string;
  locale: string;
  onOpenEmployee?: (guid: string) => void;
}) {
  const { t } = useTranslation();
  const { docs, folders, isLoading, can } = useDocuments(employeeId);
  const [by, setBy] = useState<"folders" | "emps">("folders");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [open, setOpen] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [uploading, setUploading] = useState(false);
  /** Окно папки: `true` — новая, папка — правка. */
  const [folderEdit, setFolderEdit] = useState<DocFolder | true | null>(null);
  const [folderDelete, setFolderDelete] = useState<DocFolder | null>(null);
  const reorder = useReorderFolders();
  const dropFolder = useDeleteFolder();
  const [deleting, setDeleting] = useState<Doc | null>(null);
  const [viewing, setViewing] = useState<{ list: Doc[]; index: number } | null>(null);
  const move = useMoveDocument();
  const remove = useDeleteDocument();

  const byEmp = by === "emps" && !employeeId;
  const unfiled = docs.some((doc) => !doc.folderId);
  const allFolders: DocFolder[] = useMemo(
    () => [...folders, ...(unfiled ? [{ id: NONE, name: t("doc.unfiled"), color: "gray" as const }] : [])],
    [folders, unfiled, t],
  );
  const folderOf = (doc: Doc) => allFolders.find((f) => f.id === (doc.folderId || NONE));

  const people = useMemo(() => {
    const map = new Map<string, { id: string; name: string; photo: string; count: number }>();
    for (const doc of docs) {
      if (!doc.employeeId) continue;
      const at = map.get(doc.employeeId) ?? { id: doc.employeeId, name: doc.employeeName, photo: doc.employeePhoto, count: 0 };
      at.count++;
      map.set(doc.employeeId, at);
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [docs]);

  if (isLoading) return <p className="p-8 text-center text-sm text-fg-subtle">{t("common.loading")}</p>;

  const q = query.trim().toLowerCase();
  const inside = (doc: Doc) => (byEmp ? doc.employeeId === open : (doc.folderId || NONE) === open);
  const files = q
    ? docs.filter((doc) => `${doc.title} ${doc.number} ${doc.employeeName}`.toLowerCase().includes(q))
    : open
      ? docs.filter(inside)
      : docs.slice(0, RECENT);
  const current = open ? (byEmp ? people.find((p) => p.id === open)?.name : allFolders.find((f) => f.id === open)?.name) : "";
  const home = !open && !q;

  const openDoc = (doc: Doc) => setViewing({ list: files, index: Math.max(0, files.indexOf(doc)) });
  const date = (doc: Doc) => formatDate(doc.date, "date", locale) || "—";

  const menu = (doc: Doc) => (
    <Popover
      align="end"
      trigger={({ toggle }) => (
        <button type="button" onClick={toggle} aria-label={t("doc.more")} className="rounded p-1 text-fg-muted hover:bg-surface-hover hover:text-fg">
          <Icon as={MoreVerticalIcon} size={15} />
        </button>
      )}
    >
      {(close) => (
        <>
          <PopoverItem icon={<Icon as={EyeIcon} size={14} />} onClick={() => (close(), openDoc(doc))}>
            {t("action.open")}
          </PopoverItem>
          <PopoverItem icon={<Icon as={DownloadIcon} size={14} />} onClick={() => (close(), window.open(doc.url, "_blank", "noopener"))}>
            {t("cell.download")}
          </PopoverItem>
          {can.update &&
            folders
              .filter((f) => f.id !== doc.folderId)
              .map((f) => (
                <PopoverItem
                  key={f.id}
                  icon={<Icon as={FolderInputIcon} size={14} />}
                  onClick={() => {
                    close();
                    move.mutate({ id: doc.id, folder: f.id }, { onSuccess: () => toast.success(t("doc.moved", { folder: f.name })) });
                  }}
                >
                  {t("doc.moveTo", { folder: f.name })}
                </PopoverItem>
              ))}
          {can.delete && (
            <>
              <PopoverSeparator />
              <PopoverItem danger icon={<Icon as={Trash2Icon} size={14} />} onClick={() => (close(), setDeleting(doc))}>
                {t("action.delete")}
              </PopoverItem>
            </>
          )}
        </>
      )}
    </Popover>
  );

  const person = (doc: Doc) =>
    !employeeId && doc.employeeName ? (
      <button
        type="button"
        title={t("doc.allOfEmployee")}
        onClick={(event) => {
          event.stopPropagation();
          setBy("emps");
          setOpen(doc.employeeId);
          setQuery("");
        }}
        className="inline-flex min-w-0 items-center gap-1.5 rounded-full py-0.5 pr-2 pl-0.5 text-[12.5px] text-fg-muted hover:bg-surface-hover"
      >
        <Avatar name={doc.employeeName} photo={doc.employeePhoto} size="sm" />
        <span className="truncate">{doc.employeeName}</span>
      </button>
    ) : null;

  const tiles: { id: string; name: string; count: number; lead: ReactNode; folder?: DocFolder | undefined }[] = home
    ? byEmp
      ? people.map((p) => ({ id: p.id, name: p.name, count: p.count, lead: <Avatar name={p.name} photo={p.photo} size="md" /> }))
      : allFolders.map((f) => ({
          id: f.id,
          name: f.name,
          folder: f.id === NONE ? undefined : f,
          count: docs.filter((doc) => (doc.folderId || NONE) === f.id).length,
          lead: (
            <span className={`inline-flex size-9 shrink-0 items-center justify-center rounded-lg ${CHIP_STYLES[f.color]}`}>
              <Icon as={FolderIcon} size={17} />
            </span>
          ),
        }))
    : [];

  const th = "px-2.5 py-2 text-left text-[12.5px] font-medium text-fg-muted";

  return (
    <div className={employeeId ? "" : "min-h-0 flex-1 overflow-auto px-6 pt-3.5 pb-6"}>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="mr-auto">
          <b className="flex items-center gap-2 text-[15px]">
            <Icon as={FolderOpenIcon} size={16} className="text-fg-muted" />
            {t("doc.title")}
          </b>
          <span className="text-[13px] text-fg-subtle">
            {employeeId
              ? t("doc.summaryOne", { files: docs.length, folders: allFolders.length })
              : t("doc.summary", { files: docs.length, people: people.length, folders: allFolders.length })}
          </span>
        </div>
        {can.write && (
          <>
            <Button variant="secondary" onClick={() => setFolderEdit(true)}>
              <Icon as={FolderPlusIcon} size={14} />
              {t("doc.folder")}
            </Button>
            <Button onClick={() => setUploading(true)}>
              <Icon as={UploadIcon} size={14} />
              {t("doc.upload")}
            </Button>
          </>
        )}
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <nav className="mr-auto flex min-w-0 items-center gap-1.5 text-sm">
          <button type="button" onClick={() => (setOpen(null), setQuery(""))} className="inline-flex items-center gap-1.5 text-fg-muted hover:text-fg">
            <Icon as={FolderOpenIcon} size={14} />
            {t("doc.all")}
          </button>
          {(current || q) && (
            <>
              <span className="text-fg-subtle">/</span>
              <b className="truncate font-medium">{current || t("doc.search")}</b>
            </>
          )}
        </nav>
        {!employeeId && (
          <Tabs
            variant="segment"
            activeId={by}
            onSelect={(id) => (setBy(id as typeof by), setOpen(null))}
            tabs={[
              { id: "folders", label: t("doc.byFolders"), icon: FolderIcon },
              { id: "emps", label: t("doc.byEmployees"), icon: UsersIcon },
            ]}
          />
        )}
        <label className="flex h-(--spacing-control) w-72 max-w-full items-center gap-2 rounded-md border border-border bg-surface px-2.5">
          <Icon as={SearchIcon} size={14} className="text-fg-subtle" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t(employeeId ? "doc.searchOne" : "doc.searchAll")}
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-fg-subtle"
          />
        </label>
        <Tabs
          variant="segment"
          activeId={view}
          onSelect={(id) => setView(id as typeof view)}
          tabs={[
            { id: "grid", label: "", icon: LayoutGridIcon, title: t("doc.grid") },
            { id: "list", label: "", icon: ListIcon, title: t("doc.list") },
          ]}
        />
      </div>

      {tiles.length > 0 && (
        <div className="mb-5 grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-2.5">
          {tiles.map((tile) => {
            const folder = tile.folder;
            const at = folder ? folders.indexOf(folder) : -1;
            const shift = (by: number) => {
              const ids = folders.map((f) => f.id);
              [ids[at], ids[at + by]] = [ids[at + by]!, ids[at]!];
              reorder.mutate(ids);
            };
            return (
              <div
                key={tile.id}
                className="flex items-center gap-1 rounded-[10px] border border-border bg-surface pr-1.5 transition-colors hover:bg-surface-hover"
              >
                <button type="button" onClick={() => setOpen(tile.id)} className="flex min-w-0 flex-1 items-center gap-3 p-3 text-left">
                  {tile.lead}
                  <span className="min-w-0">
                    <b className="block truncate text-sm font-medium">{tile.name}</b>
                    <small className="text-xs text-fg-subtle">{t("doc.files", { count: tile.count })}</small>
                  </span>
                </button>
                {folder && (can.update || can.delete) && (
                  <Popover
                    align="end"
                    trigger={({ toggle }) => (
                      <button type="button" onClick={toggle} aria-label={t("doc.more")} className="rounded p-1 text-fg-muted hover:bg-surface hover:text-fg">
                        <Icon as={MoreVerticalIcon} size={15} />
                      </button>
                    )}
                  >
                    {(close) => (
                      <>
                        {can.update && (
                          <>
                            <PopoverItem icon={<Icon as={PencilIcon} size={14} />} onClick={() => (close(), setFolderEdit(folder))}>
                              {t("doc.editFolder")}
                            </PopoverItem>
                            {at > 0 && (
                              <PopoverItem icon={<Icon as={ArrowUpIcon} size={14} />} onClick={() => (close(), shift(-1))}>
                                {t("doc.moveUp")}
                              </PopoverItem>
                            )}
                            {at < folders.length - 1 && (
                              <PopoverItem icon={<Icon as={ArrowDownIcon} size={14} />} onClick={() => (close(), shift(1))}>
                                {t("doc.moveDown")}
                              </PopoverItem>
                            )}
                          </>
                        )}
                        {can.delete && (
                          <>
                            <PopoverSeparator />
                            <PopoverItem danger icon={<Icon as={Trash2Icon} size={14} />} onClick={() => (close(), setFolderDelete(folder))}>
                              {t("action.delete")}
                            </PopoverItem>
                          </>
                        )}
                      </>
                    )}
                  </Popover>
                )}
              </div>
            );
          })}
        </div>
      )}

      <p className="mb-2 text-[12.5px] font-medium text-fg-muted">{home ? t("doc.recent") : t("doc.files", { count: files.length })}</p>

      {!files.length ? (
        <p className="p-8 text-center text-sm text-fg-subtle">{t("doc.empty")}</p>
      ) : view === "grid" ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-2.5">
          {files.map((doc) => (
            <div key={doc.id} className="flex min-w-0 flex-col rounded-[10px] border border-border bg-surface">
              <div className="flex items-center gap-2 px-2.5 pt-2.5">
                <FileBadge doc={doc} />
                <b className="min-w-0 flex-1 truncate text-[13px] font-medium" title={doc.title}>
                  {doc.title || fileName(doc.url)}
                </b>
                {menu(doc)}
              </div>
              <button
                type="button"
                onClick={() => openDoc(doc)}
                className="m-2.5 grid h-28 place-items-center overflow-hidden rounded-md bg-surface-hover text-fg-subtle"
              >
                {fileKind(doc.url) === "image" ? (
                  <img src={doc.url} alt="" loading="lazy" className="size-full object-cover" />
                ) : (
                  <Icon as={fileLook(doc).icon} size={32} />
                )}
              </button>
              <div className="flex min-w-0 items-center gap-1 px-2.5 pb-2.5">
                <span className="min-w-0 flex-1">{person(doc)}</span>
                <Expiry doc={doc} locale={locale} quiet />
                <small className="shrink-0 text-xs text-fg-subtle">{date(doc)}</small>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-[10px] border border-border bg-surface">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className={th}>{t("doc.name")}</th>
                {!employeeId && <th className={th}>{t("doc.employee")}</th>}
                <th className={th}>{t("doc.folderCol")}</th>
                <th className={th}>{t("doc.number")}</th>
                <th className={th}>{t("doc.date")}</th>
                <th className={th}>{t("doc.validUntil")}</th>
                <th className={th}>{t("doc.uploadedBy")}</th>
                <th className={th} />
              </tr>
            </thead>
            <tbody>
              {files.map((doc) => {
                const folder = folderOf(doc);
                return (
                  <tr key={doc.id} className="border-b border-border last:border-b-0 hover:bg-surface-hover">
                    <td className="px-2.5 py-1.5">
                      <button type="button" onClick={() => openDoc(doc)} className="flex min-w-0 items-center gap-2 text-left">
                        <FileBadge doc={doc} />
                        <span className="truncate hover:underline">{doc.title || fileName(doc.url)}</span>
                      </button>
                    </td>
                    {!employeeId && <td className="px-2.5 py-1.5">{person(doc)}</td>}
                    <td className="px-2.5 py-1.5">
                      {folder && <span className={`rounded px-1.5 py-0.5 text-xs ${CHIP_STYLES[folder.color]}`}>{folder.name}</span>}
                    </td>
                    <td className="px-2.5 py-1.5 whitespace-nowrap text-fg-muted">{doc.number || "—"}</td>
                    <td className="px-2.5 py-1.5 whitespace-nowrap">{date(doc)}</td>
                    <td className="px-2.5 py-1.5 whitespace-nowrap">
                      <Expiry doc={doc} locale={locale} />
                    </td>
                    <td className="px-2.5 py-1.5 text-fg-muted">{doc.uploadedBy || "—"}</td>
                    <td className="px-2.5 py-1.5 text-right">{menu(doc)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {uploading && (
        <UploadDialog
          employeeId={employeeId ?? (byEmp && open ? open : "")}
          fixedEmployee={Boolean(employeeId)}
          folders={folders}
          folder={!byEmp && open && open !== NONE ? open : ""}
          locale={locale}
          onClose={() => setUploading(false)}
        />
      )}
      {folderEdit && (
        <FolderDialog
          {...(folderEdit === true ? {} : { folder: folderEdit })}
          order={folders.length + 1}
          onClose={() => setFolderEdit(null)}
        />
      )}
      {folderDelete && (
        <ConfirmDialog
          title={t("doc.deleteFolderTitle", { name: folderDelete.name })}
          description={t("doc.deleteFolderText", { count: docs.filter((doc) => doc.folderId === folderDelete.id).length })}
          confirmLabel={t("action.delete")}
          busy={dropFolder.isPending}
          onClose={() => setFolderDelete(null)}
          onConfirm={() =>
            dropFolder.mutate(
              { id: folderDelete.id, docs: docs.filter((doc) => doc.folderId === folderDelete.id).map((doc) => doc.id) },
              {
                onSuccess: () => {
                  toast.success(t("doc.folderDeleted"));
                  if (open === folderDelete.id) setOpen(null);
                  setFolderDelete(null);
                },
              },
            )
          }
        />
      )}
      {viewing && viewing.list[viewing.index] && (
        <DocumentViewer
          /* Свежие строки: после переноса папка в окне — новая. */
          list={viewing.list.map((doc) => docs.find((x) => x.id === doc.id) ?? doc)}
          index={viewing.index}
          folders={folders}
          locale={locale}
          canUpdate={can.update}
          canDelete={can.delete}
          onStep={(index) => setViewing({ ...viewing, index })}
          onClose={() => setViewing(null)}
          onDelete={(doc) => setDeleting(doc)}
          {...(onOpenEmployee ? { onOpenEmployee } : {})}
        />
      )}
      {deleting && (
        <ConfirmDialog
          title={t("doc.deleteTitle")}
          description={deleting.title}
          confirmLabel={t("action.delete")}
          busy={remove.isPending}
          onClose={() => setDeleting(null)}
          onConfirm={() =>
            remove.mutate(deleting.id, {
              onSuccess: () => {
                toast.success(t("doc.deleted"));
                setDeleting(null);
                setViewing(null);
              },
            })
          }
        />
      )}
    </div>
  );
}

/** «Загрузить документы»: сотрудник, папка, файлы — `uploadModal` прототипа. */
export function UploadDialog({
  employeeId,
  fixedEmployee,
  folders,
  folder: initialFolder,
  locale,
  onClose,
}: {
  locale: string;
  employeeId: string;
  fixedEmployee: boolean;
  folders: DocFolder[];
  folder: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [employee, setEmployee] = useState(employeeId);
  const [folder, setFolder] = useState(initialFolder);
  const [files, setFiles] = useState<File[]>([]);
  const [number, setNumber] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [search, setSearch] = useState("");
  const [over, setOver] = useState(false);
  const people = useItems(fixedEmployee ? undefined : EMPLOYEES, { ...ALL, relations: false }).page.rows;
  const upload = useUploadFiles();
  const add = useAddDocuments();
  const busy = upload.isPending || add.isPending;
  const label = "mb-1.5 block text-[12.5px] text-fg-muted";

  /* Типы и размер — как в прототипе; что не прошло, называется по имени. */
  const pick = (list: File[]) => {
    const { ok, bad } = splitUpload(list);
    setFiles(ok as File[]);
    for (const file of bad)
      toast.error(t(file.reason === "type" ? "doc.badType" : "doc.tooBig", { name: file.name, mb: UPLOAD_MAX / 1048576 }));
  };

  const submit = async () => {
    const urls = await upload.mutateAsync({ files, folder: "Media" });
    await add.mutateAsync({ employee, folder, number: number.trim(), validUntil, files: urls.map((url, i) => ({ url, name: files[i]?.name ?? fileName(url) })) });
    toast.success(t("doc.uploaded", { count: urls.length }));
    onClose();
  };

  return (
    <Modal onClose={onClose}>
      <div className="w-full max-w-lg rounded-xl border border-border bg-surface shadow-modal">
        <h2 className="border-b border-border px-4 py-3 font-semibold">{t("doc.uploadTitle")}</h2>
        <div className="flex flex-col gap-3 px-4 py-3">
          <div className="grid gap-3 sm:grid-cols-2">
            {!fixedEmployee && (
              <div>
                <span className={label}>{t("doc.employee")}</span>
                <Dropdown
                  value={employee}
                  placeholder={t("doc.pickEmployee")}
                  search={search}
                  onSearch={setSearch}
                  items={people
                    .map((row) => ({ value: text(row.guid), label: text(row.full_name) }))
                    .filter((item) => !search.trim() || item.label.toLowerCase().includes(search.trim().toLowerCase()))}
                  onChange={setEmployee}
                />
              </div>
            )}
            <div>
              <span className={label}>{t("doc.folderCol")}</span>
              <Dropdown
                value={folder}
                placeholder={t("doc.unfiled")}
                items={[{ value: "", label: t("doc.unfiled") }, ...folders.map((f) => ({ value: f.id, label: f.name }))]}
                onChange={setFolder}
              />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label>
              <span className={label}>{t("doc.number")}</span>
              <Input value={number} onChange={(e) => setNumber(e.target.value)} placeholder={t("doc.numberHint")} />
            </label>
            <div>
              <span className={label}>{t("doc.validUntil")}</span>
              <DatePicker
                value={validUntil}
                locale={locale}
                placeholder={t("doc.forever")}
                clearLabel={t("doc.forever")}
                ariaLabel={t("doc.validUntil")}
                className="h-9 w-full"
                onChange={setValidUntil}
              />
            </div>
          </div>
          <label
            onDragOver={(e) => (e.preventDefault(), setOver(true))}
            onDragLeave={() => setOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setOver(false);
              pick([...e.dataTransfer.files]);
            }}
            className={`flex cursor-pointer flex-col items-center gap-1.5 rounded-lg border border-dashed p-6 text-center transition-colors ${
              over ? "border-accent bg-accent-subtle" : "border-border-strong hover:bg-surface-hover"
            }`}
          >
            <Icon as={UploadCloudIcon} size={22} className="text-fg-muted" />
            <b className="text-sm font-medium">{t("doc.drop")}</b>
            <span className="text-xs text-fg-subtle">{t("doc.dropHint", { mb: UPLOAD_MAX / 1048576 })}</span>
            <input
              type="file"
              multiple
              hidden
              accept={UPLOAD_EXT.map((x) => `.${x}`).join(",")}
              onChange={(e) => {
                pick([...(e.target.files ?? [])]);
                e.target.value = "";
              }}
            />
          </label>
          {files.length > 0 && (
            <ul className="flex flex-col gap-1 text-[13px]">
              {files.map((file) => (
                <li key={file.name} className="flex items-center gap-2">
                  <Icon as={FileIcon} size={14} className="text-fg-muted" />
                  <span className="min-w-0 flex-1 truncate">{file.name}</span>
                  <small className="text-fg-subtle">{Math.max(1, Math.round(file.size / 1024))} KB</small>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="flex justify-end gap-2 border-t border-border px-4 py-3">
          <Button variant="secondary" onClick={onClose}>
            {t("action.cancel")}
          </Button>
          <Button disabled={!files.length || !employee || busy} onClick={() => void submit().catch(() => undefined)}>
            {files.length ? t("doc.uploadN", { count: files.length }) : t("doc.upload")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

/** Новая папка или правка: имя и цвет — `dNewF` прототипа. */
export function FolderDialog({ folder, order, onClose }: { folder?: DocFolder; order: number; onClose: () => void }) {
  const { t } = useTranslation();
  const [name, setName] = useState(folder?.name ?? "");
  const [color, setColor] = useState<ChipColor>(folder?.color ?? "blue");
  const save = useSaveFolder();
  const submit = () => {
    if (!name.trim()) return;
    save.mutate(
      { ...(folder ? { id: folder.id } : { order }), name: name.trim(), color },
      {
        onSuccess: () => {
          toast.success(t(folder ? "doc.folderSaved" : "doc.folderCreated"));
          onClose();
        },
      },
    );
  };
  return (
    <Modal onClose={onClose}>
      <div className="w-full max-w-sm rounded-xl border border-border bg-surface shadow-modal">
        <h2 className="border-b border-border px-4 py-3 font-semibold">{t(folder ? "doc.editFolder" : "doc.newFolder")}</h2>
        <div className="flex flex-col gap-3 px-4 py-3">
          <Input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            placeholder={t("doc.folderHint")}
          />
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={t("doc.color")}>
            {CHIP_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={c === color}
                aria-label={c}
                onClick={() => setColor(c)}
                className={`inline-flex size-8 items-center justify-center rounded-lg ${CHIP_STYLES[c]} ${c === color ? "ring-2 ring-accent" : ""}`}
              >
                <Icon as={c === color ? CheckIcon : FolderIcon} size={15} />
              </button>
            ))}
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-border px-4 py-3">
          <Button variant="secondary" onClick={onClose}>
            {t("action.cancel")}
          </Button>
          <Button disabled={!name.trim() || save.isPending} onClick={submit}>
            {t(folder ? "action.save" : "action.create")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

/**
 * HTML-документ (акт из «Имущества») — текстом в песочницу: CDN может
 * отдать его как скачивание, а `srcDoc` от типа ответа не зависит.
 */
function HtmlStage({ doc }: { doc: Doc }) {
  const [html, setHtml] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    fetch(doc.url)
      .then((r) => r.text())
      .then((text) => live && setHtml(text))
      .catch(() => live && setHtml(""));
    return () => {
      live = false;
    };
  }, [doc.url]);
  return <iframe title={doc.title} sandbox="" srcDoc={html ?? ""} className="h-[70vh] w-full rounded-md bg-white shadow-raised" />;
}

/** Чем показывать файл: картинка, PDF и HTML браузером, Office — просмотрщиком Microsoft. */
function Stage({ doc }: { doc: Doc }) {
  const { t } = useTranslation();
  const e = ext(doc);
  if (e === "html" || e === "htm") return <HtmlStage doc={doc} />;
  if (fileKind(doc.url) === "image") return <img src={doc.url} alt="" className="max-h-[70vh] max-w-full rounded-md shadow-raised" />;
  if (e === "pdf") return <iframe title={doc.title} src={doc.url} className="h-[70vh] w-full rounded-md bg-white shadow-raised" />;
  /* ponytail: Office Online читает файл по публичной ссылке CDN; закроют CDN — свой конвертер. */
  if (["doc", "docx", "xls", "xlsx", "ppt", "pptx"].includes(e))
    return (
      <iframe
        title={doc.title}
        src={`https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(doc.url)}`}
        className="h-[70vh] w-full rounded-md bg-white shadow-raised"
      />
    );
  return (
    <div className="grid place-items-center gap-2 p-10 text-sm text-fg-subtle">
      <Icon as={fileLook(doc).icon} size={40} />
      {t("doc.noPreview")}
    </div>
  );
}

const kb = (size: number) => (size > 1048576 ? `${(size / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(size / 1024))} KB`);

/**
 * Просмотр документа — `openDoc` прототипа: перелистывание, масштаб,
 * печать, скачивание; справа — сведения, «Переместить в папку»,
 * «Копировать ссылку», «Удалить». Стрелки листают.
 */
export function DocumentViewer({
  list,
  index,
  folders,
  locale,
  canUpdate,
  canDelete,
  onStep,
  onClose,
  onDelete,
  onOpenEmployee,
}: {
  list: Doc[];
  index: number;
  folders: DocFolder[];
  locale: string;
  canUpdate: boolean;
  canDelete: boolean;
  onStep: (index: number) => void;
  onClose: () => void;
  onDelete: (doc: Doc) => void;
  onOpenEmployee?: (guid: string) => void;
}) {
  const { t } = useTranslation();
  const doc = list[index]!;
  const [zoom, setZoom] = useState(1);
  const meta = useFileMeta(doc.url);
  const { departments } = useOrgDirectory();
  const move = useMoveDocument();
  const update = useUpdateDocument();
  const folder = folders.find((f) => f.id === doc.folderId);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft" && index > 0) onStep(index - 1);
      if (event.key === "ArrowRight" && index < list.length - 1) onStep(index + 1);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [index, list.length, onStep]);

  const tool = "rounded p-1.5 text-fg-muted hover:bg-surface-hover hover:text-fg disabled:opacity-40";
  const props: [string, ReactNode][] = [
    [
      t("doc.employee"),
      doc.employeeName ? (
        onOpenEmployee ? (
          <button type="button" onClick={() => onOpenEmployee(doc.employeeId)} className="text-accent-text hover:underline">
            {doc.employeeName}
          </button>
        ) : (
          doc.employeeName
        )
      ) : (
        "—"
      ),
    ],
    [t("doc.department"), departments.find((d) => d.id === doc.departmentId)?.name || "—"],
    [
      t("doc.folderCol"),
      <span className={`rounded px-1.5 py-0.5 text-xs ${CHIP_STYLES[folder?.color ?? "gray"]}`}>{folder?.name ?? t("doc.unfiled")}</span>,
    ],
    [
      t("doc.number"),
      canUpdate ? (
        <CommitInput
          key={doc.id}
          value={doc.number}
          allowEmpty
          label={t("doc.number")}
          placeholder={t("doc.numberHint")}
          className="mt-1 h-8"
          onCommit={(number) => update.mutate({ id: doc.id, number })}
        />
      ) : (
        doc.number || "—"
      ),
    ],
    [
      t("doc.validUntil"),
      canUpdate ? (
        <span className="mt-1 flex items-center gap-2">
          <DatePicker
            value={doc.validUntil}
            locale={locale}
            placeholder={t("doc.forever")}
            clearLabel={t("doc.forever")}
            ariaLabel={t("doc.validUntil")}
            className="h-8 flex-1"
            onChange={(validUntil) => update.mutate({ id: doc.id, validUntil })}
          />
          <Expiry doc={doc} locale={locale} quiet />
        </span>
      ) : (
        <Expiry doc={doc} locale={locale} />
      ),
    ],
    [t("doc.type"), ext(doc).toUpperCase() || "—"],
    [t("doc.size"), meta?.size ? kb(meta.size) : "—"],
    [t("doc.date"), formatDate(doc.date, "date", locale) || "—"],
    [t("doc.uploadedBy"), doc.uploadedBy || "—"],
  ];

  return (
    <Modal onClose={onClose}>
      <div className="flex max-h-[92vh] w-[min(1100px,96vw)] flex-col rounded-xl border border-border bg-surface shadow-modal">
        <header className="flex items-center gap-2.5 border-b border-border px-4 py-3">
          <FileBadge doc={doc} />
          <div className="min-w-0 flex-1">
            <b className="block truncate font-semibold">{doc.title || fileName(doc.url)}</b>
            <small className="text-[12.5px] text-fg-subtle">
              {[folder?.name ?? t("doc.unfiled"), meta?.size ? kb(meta.size) : ""].filter(Boolean).join(" · ")}
            </small>
          </div>
          <button type="button" onClick={onClose} aria-label={t("action.close")} className={tool}>
            <Icon as={XIcon} size={16} />
          </button>
        </header>
        <div className="flex min-h-0 flex-1 flex-col md:flex-row">
          <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-surface-hover">
            <div className="flex items-center gap-1 border-b border-border bg-surface px-2 py-1.5 text-xs text-fg-muted">
              <button type="button" disabled={index === 0} onClick={() => onStep(index - 1)} aria-label={t("action.previous")} className={tool}>
                <Icon as={ChevronLeftIcon} size={15} />
              </button>
              <span className="tabular-nums">
                {index + 1} / {list.length}
              </span>
              <button type="button" disabled={index >= list.length - 1} onClick={() => onStep(index + 1)} aria-label={t("action.next")} className={tool}>
                <Icon as={ChevronRightIcon} size={15} />
              </button>
              <span className="flex-1" />
              <button type="button" onClick={() => setZoom((z) => Math.max(0.5, z - 0.15))} aria-label={t("doc.zoomOut")} className={tool}>
                <Icon as={ZoomOutIcon} size={15} />
              </button>
              <span className="w-10 text-center tabular-nums">{Math.round(zoom * 100)}%</span>
              <button type="button" onClick={() => setZoom((z) => Math.min(2, z + 0.15))} aria-label={t("doc.zoomIn")} className={tool}>
                <Icon as={ZoomInIcon} size={15} />
              </button>
              <span className="flex-1" />
              <button type="button" onClick={() => window.open(doc.url, "_blank", "noopener")?.print()} aria-label={t("doc.print")} title={t("doc.print")} className={tool}>
                <Icon as={PrinterIcon} size={15} />
              </button>
              <a href={doc.url} download target="_blank" rel="noreferrer noopener" aria-label={t("cell.download")} title={t("cell.download")} className={tool}>
                <Icon as={DownloadIcon} size={15} />
              </a>
            </div>
            <div className="min-h-0 flex-1 overflow-auto p-4">
              <div className="grid origin-top place-items-center transition-transform" style={{ transform: `scale(${zoom})` }}>
                <Stage key={doc.id} doc={doc} />
              </div>
            </div>
          </div>
          <aside className="flex w-full shrink-0 flex-col gap-3 overflow-auto border-t border-border p-4 md:w-72 md:border-t-0 md:border-l">
            <dl className="flex flex-col gap-2.5">
              {props.map(([label, value]) => (
                <div key={label}>
                  <dt className="text-xs text-fg-subtle">{label}</dt>
                  <dd className="text-sm font-medium">{value}</dd>
                </div>
              ))}
            </dl>
            {canUpdate && (
              <div>
                <span className="mb-1.5 flex items-center gap-1.5 text-xs text-fg-subtle">
                  {t("doc.moveToFolder")}
                  {move.isPending && <Icon as={LoaderCircleIcon} size={12} className="animate-spin" />}
                </span>
                <Dropdown
                  value={move.isPending ? move.variables.folder : doc.folderId}
                  disabled={move.isPending}
                  items={[{ value: "", label: t("doc.unfiled") }, ...folders.map((f) => ({ value: f.id, label: f.name }))]}
                  onChange={(next) =>
                    move.mutate(
                      { id: doc.id, folder: next },
                      { onSuccess: () => toast.success(t("doc.moved", { folder: folders.find((f) => f.id === next)?.name ?? t("doc.unfiled") })) },
                    )
                  }
                />
              </div>
            )}
            <div className="flex flex-col gap-1.5">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => void navigator.clipboard.writeText(doc.url).then(() => toast.success(t("doc.linkCopied")))}
              >
                <Icon as={LinkIcon} size={13} />
                {t("doc.copyLink")}
              </Button>
              {canDelete && (
                <Button size="sm" variant="danger" onClick={() => onDelete(doc)}>
                  <Icon as={Trash2Icon} size={13} />
                  {t("action.delete")}
                </Button>
              )}
            </div>
          </aside>
        </div>
      </div>
    </Modal>
  );
}
