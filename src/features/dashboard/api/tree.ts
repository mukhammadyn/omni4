import { useEffect, useMemo, useRef, useState } from "react";
import { useGlobalRight, useIsSuperRole } from "@/features/auth";
import { ROOT_MENU_ID, useCreateMenu, useScreenMenu, useSetMenuAttribute } from "@/features/sidebar";
import { useDataLanguages } from "@/features/workspace";
import { errorMessage } from "@/shared/lib/toast";
import { toTree, toTreeAttribute, type Tree } from "../model/dashboard";

/** `attributes.screen` пункта-хранилища (ADR-0013). */
const STORE = "dashboards";

/**
 * Дерево дашбордов проекта из пункта-хранилища.
 *
 * Хранилища может не быть: оно заводится первой записью — пунктом
 * `LINK` в корне меню. Правки, пришедшие, пока оно заводится, ждут
 * его и уходят одной записью следом.
 *
 * Источник правды на экране — местный черновик: PUT отвечает
 * перечитанным меню, и ждать его ради нового дашборда незачем.
 */
export function useDashboardTree() {
  const { node, isLoading } = useScreenMenu(STORE);
  const isAdmin = useIsSuperRole();
  // Корневой пункт заводит тот, кому можно заводить пункты в корне.
  const canCreateRoot = useGlobalRight("menu_button");
  const { languages } = useDataLanguages();
  const setAttribute = useSetMenuAttribute();
  const create = useCreateMenu();
  const [draft, setDraft] = useState<Tree | null>(null);
  const pending = useRef<{ next: Tree; version: number; resolve: ((saved: boolean) => void)[] } | null>(null);
  const writes = useRef<Promise<void>>(Promise.resolve());
  const version = useRef(0);
  const saved = useRef<Tree | null>(null);
  const failed = useRef<Tree | null>(null);
  const [saving, setSaving] = useState(0);
  const [saveError, setSaveError] = useState<string | null>(null);

  const stored = useMemo(() => toTree(node?.raw.attributes?.[STORE]), [node]);
  const nodeId = node?.id ?? "";

  const persist = (id: string, request: { next: Tree; version: number; resolve: ((saved: boolean) => void)[] }) => {
    writes.current = writes.current.then(async () => {
      let ok = false;
      try {
        await setAttribute.mutateAsync({ id, key: STORE, value: toTreeAttribute(request.next) });
        saved.current = request.next; ok = true;
        if (request.version === version.current) { failed.current = null; setSaveError(null); }
      } catch (error) {
        if (request.version === version.current) {
          failed.current = request.next; setDraft(saved.current ?? stored);
          setSaveError(errorMessage(error, "dashboard.saveFailed"));
        }
      } finally {
        setSaving((count) => Math.max(0, count - request.resolve.length));
        request.resolve.forEach((resolve) => resolve(ok));
      }
    });
  };

  useEffect(() => {
    if (!nodeId || !pending.current) return;
    const request = pending.current; pending.current = null;
    persist(nodeId, request);
  });

  const save = (next: Tree) => {
    setDraft(next);
    setSaveError(null); setSaving((count) => count + 1);
    const currentVersion = ++version.current;
    const result = new Promise<boolean>((resolve) => {
      if (nodeId) { persist(nodeId, { next, version: currentVersion, resolve: [resolve] }); return; }
      const queued = pending.current !== null || create.isPending;
      pending.current = { next, version: currentVersion, resolve: [...(pending.current?.resolve ?? []), resolve] };
      if (queued) return;
      create.mutate({
      labels: { [languages[0]?.code ?? "ru"]: "Dashboards" },
      icon: "",
      type: "LINK",
      parentId: ROOT_MENU_ID,
      attributes: { screen: STORE },
      }, { onError: (error) => {
        const request = pending.current; pending.current = null;
        if (!request) return;
        failed.current = request.next; setDraft(saved.current ?? stored);
        setSaveError(errorMessage(error, "dashboard.saveFailed"));
        setSaving((count) => Math.max(0, count - request.resolve.length)); request.resolve.forEach((resolve) => resolve(false));
      } });
    });
    return result;
  };

  return {
    tree: draft ?? stored,
    menuId: nodeId,
    isLoading,
    isSaving: saving > 0,
    saveError,
    retrySave: () => failed.current ? save(failed.current) : Promise.resolve(false),
    /** Хранилища ещё нет — читать нечего, но и запрета нет. */
    canRead: !node || isAdmin || node.can.read,
    canEdit: isAdmin || (node ? node.can.update : canCreateRoot),
    save,
  };
}
