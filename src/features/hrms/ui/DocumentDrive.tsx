import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ChevronRightIcon,
  DownloadIcon,
  EllipsisIcon,
  EyeIcon,
  FolderIcon,
  FolderInputIcon,
  FolderLockIcon,
  FolderOpenIcon,
  FolderPlusIcon,
  LayoutGridIcon,
  ListIcon,
  MoreVerticalIcon,
  PencilIcon,
  SearchIcon,
  SearchXIcon,
  Trash2Icon,
  UploadIcon,
} from "lucide-react";
import { Avatar, useFileMeta } from "@/features/item";
import { formatDate } from "@/shared/lib/date-value";
import { fileKind, fileName } from "@/shared/lib/file-kind";
import { toast } from "@/shared/lib/toast";
import { Button } from "@/shared/ui/button";
import { CHIP_DOT, type ChipColor } from "@/shared/ui/chip";
import { ConfirmDialog } from "@/shared/ui/confirm-dialog";
import { Icon } from "@/shared/ui/icon";
import { Popover, PopoverItem, PopoverSeparator } from "@/shared/ui/popover";
import { Tabs } from "@/shared/ui/tabs";
import { useDeleteDocument, useDeleteFolder, useDocuments, useMoveDocument, type Doc, type DocFolder } from "../api/document";
import { DocumentViewer, FolderDialog, UploadDialog, fileLook } from "./DocumentBrowser";

/**
 * Кадровые документы в виде `mkDrive` прототипа (settings.html,
 * «Файлы и документы»): крошки от корня, поиск, список или сетка,
 * «Папка» и «Загрузить», внизу счёт.
 *
 * Те же данные и окна, что у DocumentBrowser (загрузка, папка,
 * просмотр), — другой только вид. Папки у нас плоские
 * (`hr_document_folders` без родителя), поэтому глубина — корень
 * и папка; документы без папки лежат в корне, как файлы прототипа.
 */
export function DocumentDrive({ locale }: { locale: string }) {
  const { t } = useTranslation();
  const { docs, folders, isLoading, can } = useDocuments();
  const [open, setOpen] = useState("");
  const [query, setQuery] = useState("");
  const [view, setView] = useState<"list" | "grid">("list");
  const [uploading, setUploading] = useState(false);
  const [folderEdit, setFolderEdit] = useState<DocFolder | true | null>(null);
  const [folderDelete, setFolderDelete] = useState<DocFolder | null>(null);
  const [deleting, setDeleting] = useState<Doc | null>(null);
  const [viewing, setViewing] = useState<{ list: Doc[]; index: number } | null>(null);
  const move = useMoveDocument();
  const remove = useDeleteDocument();
  const dropFolder = useDeleteFolder();

  if (isLoading) return <p className="p-8 text-center text-sm text-fg-subtle">{t("common.loading")}</p>;

  const q = query.trim().toLowerCase();
  const current = folders.find((folder) => folder.id === open);
  const inFolder = (folder: DocFolder) => docs.filter((doc) => doc.folderId === folder.id);

  const shownFolders = q ? folders.filter((f) => !open && f.name.toLowerCase().includes(q)) : open ? [] : folders;
  const files = docs.filter((doc) =>
    q
      ? (!open || doc.folderId === open) && `${doc.title} ${doc.number} ${doc.employeeName}`.toLowerCase().includes(q)
      : open
        ? doc.folderId === open
        : !doc.folderId,
  );
  const total = shownFolders.length + files.length;

  const go = (id: string) => {
    setOpen(id);
    setQuery("");
  };
  const openDoc = (doc: Doc) => setViewing({ list: files, index: Math.max(0, files.indexOf(doc)) });
  const where = (doc: Doc) => folders.find((f) => f.id === doc.folderId)?.name ?? t("dir.drive");
  const date = (doc: Doc) => formatDate(doc.date, "date", locale) || "—";

  const fileMenu = (doc: Doc, vertical?: boolean) => (
    <Popover
      align="end"
      trigger={({ toggle }) => (
        <button type="button" onClick={toggle} aria-label={t("doc.more")} className={MORE}>
          <Icon as={vertical ? MoreVerticalIcon : EllipsisIcon} size={15} />
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
            [{ id: "", name: t("dir.drive") }, ...folders]
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

  const folderMenu = (folder: DocFolder, vertical?: boolean) => (
    <Popover
      align="end"
      trigger={({ toggle }) => (
        <button type="button" onClick={toggle} aria-label={t("doc.more")} className={MORE}>
          <Icon as={vertical ? MoreVerticalIcon : EllipsisIcon} size={15} />
        </button>
      )}
    >
      {(close) => (
        <>
          <PopoverItem icon={<Icon as={FolderOpenIcon} size={14} />} onClick={() => (close(), go(folder.id))}>
            {t("action.open")}
          </PopoverItem>
          {can.update && (
            <PopoverItem icon={<Icon as={PencilIcon} size={14} />} onClick={() => (close(), setFolderEdit(folder))}>
              {t("doc.editFolder")}
            </PopoverItem>
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
  );

  return (
    <div>
      {/* `.dr-bar`: крошки, поиск, вид, «Папка», «Загрузить». */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <nav className="flex min-w-0 flex-1 items-center gap-0.5">
          <button type="button" onClick={() => go("")} className={`${CRUMB} shrink-0 ${open ? "" : "font-semibold text-fg"}`}>
            <Icon as={FolderLockIcon} size={15} />
            {t("dir.drive")}
          </button>
          {current && (
            <>
              <Icon as={ChevronRightIcon} size={14} className="shrink-0 text-fg-subtle" />
              <span className="min-w-0 truncate px-2 text-[15px] leading-7 font-semibold text-fg">{current.name}</span>
            </>
          )}
        </nav>
        <label className="flex h-(--spacing-control) w-48 shrink-0 items-center gap-2 rounded-md border border-border bg-surface px-2.5">
          <Icon as={SearchIcon} size={14} className="text-fg-subtle" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("dir.driveSearch")}
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-fg-subtle"
          />
        </label>
        <Tabs
          variant="segment"
          activeId={view}
          onSelect={(id) => setView(id as typeof view)}
          tabs={[
            { id: "list", label: "", icon: ListIcon, title: t("doc.list") },
            { id: "grid", label: "", icon: LayoutGridIcon, title: t("doc.grid") },
          ]}
        />
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

      {!total ? (
        <div className="flex flex-col items-center gap-1.5 rounded-[10px] border-[1.5px] border-dashed border-border py-14 text-fg-subtle">
          <Icon as={q ? SearchXIcon : FolderOpenIcon} size={36} strokeWidth={1.3} />
          <b className="font-medium text-fg-muted">{q ? t("dir.notFound") : t("dir.driveEmpty")}</b>
          <span className="text-[13px]">{q ? t("dir.driveTryOther") : t("dir.driveEmptyHint")}</span>
        </div>
      ) : view === "grid" ? (
        <>
          {shownFolders.length > 0 && (
            <>
              <p className={LABEL}>{t("dir.driveFolders")}</p>
              <div className="mb-5.5 grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3">
                {shownFolders.map((folder) => (
                  <div
                    key={folder.id}
                    onClick={() => go(folder.id)}
                    className="flex cursor-pointer items-center gap-2.5 rounded-[10px] bg-surface-hover py-2.5 pr-1.5 pl-3 transition-shadow hover:shadow-[inset_0_0_0_1px_var(--color-border-strong)]"
                  >
                    <FolderMark color={folder.color} />
                    <span className="min-w-0 flex-1">
                      <b className="block truncate text-[13.5px] font-medium">{folder.name}</b>
                      <small className="block truncate text-xs text-fg-subtle">{t("doc.files", { count: inFolder(folder).length })}</small>
                    </span>
                    <span onClick={(event) => event.stopPropagation()}>{folderMenu(folder, true)}</span>
                  </div>
                ))}
              </div>
            </>
          )}
          {files.length > 0 && (
            <>
              <p className={LABEL}>{t("dir.driveFiles")}</p>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3">
                {files.map((doc) => {
                  const look = fileLook(doc);
                  return (
                    <div
                      key={doc.id}
                      onClick={() => openDoc(doc)}
                      className="cursor-pointer overflow-hidden rounded-[10px] bg-surface-hover transition-shadow hover:shadow-[inset_0_0_0_1px_var(--color-border-strong)]"
                    >
                      <div className="mx-1.5 mt-1.5 flex h-28 flex-col items-center justify-center gap-1.5 overflow-hidden rounded-md bg-surface">
                        {fileKind(doc.url) === "image" ? (
                          <img src={doc.url} alt="" loading="lazy" className="size-full object-cover" />
                        ) : (
                          <>
                            <Icon as={look.icon} size={44} strokeWidth={1.3} className={TEXT[look.color]} />
                            <span className="text-[11px] text-fg-subtle">{typeName(doc)}</span>
                          </>
                        )}
                      </div>
                      <div className="flex items-center gap-2 py-2 pr-1 pl-2.5">
                        <Icon as={look.icon} size={18} className={`shrink-0 ${TEXT[look.color]}`} />
                        <b className="min-w-0 flex-1 truncate text-[13.5px] font-medium" title={doc.title}>
                          {doc.title || fileName(doc.url)}
                        </b>
                        <span onClick={(event) => event.stopPropagation()}>{fileMenu(doc, true)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </>
      ) : (
        <table className="w-full table-fixed border-separate border-spacing-0 text-sm">
          <thead>
            <tr>
              <th className={TH}>{t("doc.name")}</th>
              <th className={`${TH} w-[28%]`}>{t("doc.employee")}</th>
              <th className={`${TH} w-32`}>{t("dir.driveModified")}</th>
              <th className={`${TH} w-28 text-right`}>{t("doc.size")}</th>
              <th className={`${TH} w-10`} />
            </tr>
          </thead>
          <tbody>
            {shownFolders.map((folder) => (
              <tr key={folder.id} onClick={() => go(folder.id)} className="group cursor-pointer hover:bg-surface-hover">
                <td className={TD}>
                  <span className="flex min-w-0 items-center gap-2.5 font-medium">
                    <FolderMark color={folder.color} />
                    <span className="truncate">{folder.name}</span>
                  </span>
                </td>
                <td className={`${TD} text-fg-subtle`}>—</td>
                <td className={`${TD} text-fg-subtle`}>—</td>
                <td className={`${TD} truncate text-right text-fg-muted tabular-nums`}>{t("doc.files", { count: inFolder(folder).length })}</td>
                <td className={`${TD} text-right`} onClick={(event) => event.stopPropagation()}>
                  {folderMenu(folder)}
                </td>
              </tr>
            ))}
            {files.map((doc) => {
              const look = fileLook(doc);
              return (
                <tr key={doc.id} onClick={() => openDoc(doc)} className="group cursor-pointer hover:bg-surface-hover">
                  <td className={TD}>
                    <span className="flex min-w-0 items-center gap-2.5 font-medium">
                      <Icon as={look.icon} size={20} className={`shrink-0 ${TEXT[look.color]}`} />
                      <span className="min-w-0">
                        <span className="block truncate">{doc.title || fileName(doc.url)}</span>
                        {q && <small className="block text-xs font-normal text-fg-subtle">{where(doc)}</small>}
                      </span>
                    </span>
                  </td>
                  <td className={TD}>
                    {doc.employeeName ? (
                      <span className="flex min-w-0 items-center gap-1.5">
                        <Avatar name={doc.employeeName} photo={doc.employeePhoto} size="sm" />
                        <span className="truncate">{doc.employeeName}</span>
                      </span>
                    ) : (
                      <span className="text-fg-subtle">—</span>
                    )}
                  </td>
                  <td className={`${TD} whitespace-nowrap text-fg-subtle`}>{date(doc)}</td>
                  <td className={`${TD} text-right text-fg-muted tabular-nums`}>
                    <Size url={doc.url} />
                  </td>
                  <td className={`${TD} text-right`} onClick={(event) => event.stopPropagation()}>
                    {fileMenu(doc)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      <p className="mt-2.5 text-xs text-fg-subtle tabular-nums">
        {q ? t("dir.found", { found: total, total: docs.length + folders.length }) : t("dir.driveItems", { count: total })}
      </p>

      {uploading && (
        <UploadDialog employeeId="" fixedEmployee={false} folders={folders} folder={open} locale={locale} onClose={() => setUploading(false)} />
      )}
      {folderEdit && (
        <FolderDialog {...(folderEdit === true ? {} : { folder: folderEdit })} order={folders.length + 1} onClose={() => setFolderEdit(null)} />
      )}
      {folderDelete && (
        <ConfirmDialog
          title={t("doc.deleteFolderTitle", { name: folderDelete.name })}
          description={t("doc.deleteFolderText", { count: inFolder(folderDelete).length })}
          confirmLabel={t("action.delete")}
          busy={dropFolder.isPending}
          onClose={() => setFolderDelete(null)}
          onConfirm={() =>
            dropFolder.mutate(
              { id: folderDelete.id, docs: inFolder(folderDelete).map((doc) => doc.id) },
              {
                onSuccess: () => {
                  toast.success(t("doc.folderDeleted"));
                  if (open === folderDelete.id) setOpen("");
                  setFolderDelete(null);
                },
              },
            )
          }
        />
      )}
      {viewing && viewing.list[viewing.index] && (
        <DocumentViewer
          list={viewing.list.map((doc) => docs.find((x) => x.id === doc.id) ?? doc)}
          index={viewing.index}
          folders={folders}
          locale={locale}
          canUpdate={can.update}
          canDelete={can.delete}
          onStep={(index) => setViewing({ ...viewing, index })}
          onClose={() => setViewing(null)}
          onDelete={(doc) => setDeleting(doc)}
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

const CRUMB =
  "inline-flex h-7 min-w-0 shrink items-center gap-1.5 truncate rounded-md px-2 text-[15px] whitespace-nowrap text-fg-muted hover:bg-surface-hover hover:text-fg";
const LABEL = "mt-1 mb-2.5 text-[13px] font-medium text-fg-muted";
const TH = "h-9 border-b border-border px-2.5 text-left text-xs font-normal text-fg-muted";
const TD = "border-b border-border px-2.5 py-1.5";
const MORE =
  "grid size-6 place-items-center rounded text-fg-subtle opacity-60 group-hover:opacity-100 hover:bg-surface-active hover:text-fg";

/** Цвет значка файла — текстом того же оттенка, что точка (`DTYPE` прототипа). */
const TEXT: Record<ChipColor, string> = {
  gray: "text-chip-gray-dot",
  blue: "text-chip-blue-dot",
  green: "text-chip-green-dot",
  yellow: "text-chip-yellow-dot",
  orange: "text-chip-orange-dot",
  red: "text-chip-red-dot",
  purple: "text-chip-purple-dot",
  pink: "text-chip-pink-dot",
  brown: "text-chip-brown-dot",
};

function typeName(doc: Doc) {
  const name = fileName(doc.url);
  const ext = name.includes(".") ? name.split(".").pop()!.toLowerCase() : "";
  if (ext === "doc" || ext === "docx") return "Word";
  if (ext === "xls" || ext === "xlsx") return "Excel";
  return ext.toUpperCase() || "—";
}

function FolderMark({ color }: { color: ChipColor }) {
  return (
    <span className="relative grid size-6 shrink-0 place-items-center text-fg-subtle">
      <Icon as={FolderIcon} size={20} />
      <span className={`absolute right-0 bottom-0.5 size-2 rounded-full ring-2 ring-surface ${CHIP_DOT[color]}`} />
    </span>
  );
}

/*
 * ponytail: размер — HEAD к CDN на каждую видимую строку (useFileMeta,
 * кэш навсегда). В папке десятки файлов; при поиске по сотням — сотни
 * HEAD. Станет заметно — хранить размер в `hr_documents` при загрузке.
 */
function Size({ url }: { url: string }) {
  const size = useFileMeta(url)?.size;
  if (!size) return <>—</>;
  return <>{size < 1024 ? `${size} Б` : size < 1048576 ? `${Math.round(size / 1024)} КБ` : `${(size / 1048576).toFixed(1).replace(".", ",")} МБ`}</>;
}
