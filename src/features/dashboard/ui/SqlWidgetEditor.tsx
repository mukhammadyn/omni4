import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/shared/ui/button";
import { Field, Input } from "@/shared/ui/input";
import { Modal } from "@/shared/ui/modal";
import { useDialogFocus } from "@/shared/lib/use-dialog-focus";
import type { Widget } from "../model/dashboard";
import type { Dataset } from "../model/datasets";
import { SqlDatasetWidget } from "./SqlDatasetWidget";

export function SqlWidgetEditor({ initial, dataset, menuId, onSave, onClose }: { initial: Widget; dataset: Dataset; menuId: string; onSave: (widget: Widget) => void; onClose: () => void }) {
  const { t } = useTranslation(), dialog = useDialogFocus(onClose), [draft, setDraft] = useState(initial);
  return <Modal onClose={onClose}><div ref={dialog} role="dialog" aria-modal="true" aria-label={t("dashboard.editWidget")} className="flex max-h-[90vh] w-[900px] max-w-full flex-col gap-3 overflow-auto rounded-xl border border-border bg-surface p-5 shadow-modal"><h2 className="text-lg font-semibold">{t("dashboard.editWidget")} · SQL</h2><Field label={t("dashboard.widgetTitle")}><Input data-autofocus value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></Field><SqlDatasetWidget dataset={dataset} widget={draft} menuId={menuId} editing onChange={(patch) => setDraft({ ...draft, ...patch })} /><footer className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={onClose}>{t("action.cancel")}</Button><Button type="button" onClick={() => onSave(draft)}>{t("action.save")}</Button></footer></div></Modal>;
}
