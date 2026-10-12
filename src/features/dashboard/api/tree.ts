import { useEffect, useMemo, useRef, useState } from "react";
import { useGlobalRight, useIsSuperRole } from "@/features/auth";
import { ROOT_MENU_ID, useCreateMenu, useScreenMenu, useSetMenuAttribute } from "@/features/sidebar";
import { useDataLanguages } from "@/features/workspace";
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
  const pending = useRef<Record<string, unknown> | null>(null);

  const stored = useMemo(() => toTree(node?.raw.attributes?.[STORE]), [node]);
  const nodeId = node?.id ?? "";

  useEffect(() => {
    if (!nodeId || !pending.current) return;
    setAttribute.mutate({ id: nodeId, key: STORE, value: pending.current });
    pending.current = null;
  }, [nodeId, setAttribute]);

  const save = (next: Tree) => {
    setDraft(next);
    const value = toTreeAttribute(next);

    if (nodeId) {
      setAttribute.mutate({ id: nodeId, key: STORE, value });
      return;
    }
    const queued = create.isPending || pending.current !== null;
    pending.current = value;
    if (queued) return;

    create.mutate({
      labels: { [languages[0]?.code ?? "ru"]: "Dashboards" },
      icon: "",
      type: "LINK",
      parentId: ROOT_MENU_ID,
      attributes: { screen: STORE },
    });
  };

  return {
    tree: draft ?? stored,
    isLoading,
    /** Хранилища ещё нет — читать нечего, но и запрета нет. */
    canRead: !node || isAdmin || node.can.read,
    canEdit: isAdmin || (node ? node.can.update : canCreateRoot),
    save,
  };
}
