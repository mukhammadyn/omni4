import { useState } from "react";
import { useTranslation } from "react-i18next";
import { XIcon } from "lucide-react";
import { Model } from "survey-core";
import "survey-core/i18n/russian";
import "survey-core/survey-core.min.css";
import { Survey } from "survey-react-ui";
import { Icon } from "@/shared/ui/icon";
import { toast } from "@/shared/lib/toast";
import { Modal } from "@/shared/ui/modal";
import type { Answers, Definition } from "../model/survey";
import "./survey-theme.css";

/**
 * Форма опроса в окне — `runSurvey()` прототипа: «Пройти тест» (ответы
 * никуда не уходят), ответы сотрудника (`answers`, только чтение)
 * и прохождение (`onSubmit` — `svModal()` вкладки сотрудника).
 * Отдельным чанком (ADR-0015): без конструктора, только survey-core.
 */
export default function SurveyRunner({
  title,
  definition,
  answers,
  locale,
  onSubmit,
  onClose,
}: {
  title: string;
  definition: Definition;
  /** Есть — показываем ответы, правка закрыта. */
  answers?: Answers;
  locale: string;
  /** Есть — прохождение всерьёз: ответы уходят сюда на «Завершить». */
  onSubmit?: (answers: Answers) => Promise<unknown>;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [model] = useState(() => {
    const survey = new Model(definition);
    survey.locale = locale.startsWith("en") ? "en" : "ru";
    if (answers) {
      survey.data = answers;
      survey.mode = "display";
      survey.showCompletedPage = false;
    } else if (onSubmit) {
      /* Пока не записано — «отправляем»; записалось — окно закрывается
         с уведомлением; отказ — плашка SurveyJS с «Попробовать снова»
         (повтор зовёт onComplete заново), причина — уведомлением мутации. */
      survey.completedHtml = `<p>${t("survey.take.sending")}</p>`;
      survey.onComplete.add((sender, options) => {
        options.showSaveInProgress();
        onSubmit(sender.data as Answers).then(
          () => {
            toast.success(t("survey.take.done"));
            onClose();
          },
          () => options.showSaveError(t("common.saveFailed")),
        );
      });
    } else {
      survey.completedHtml = `<p>${t("survey.page.testDone")}</p>`;
    }
    return survey;
  });

  return (
    <Modal onClose={onClose}>
      <div className="flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-modal">
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <h2 className="min-w-0 flex-1 truncate font-semibold">{title}</h2>
          {!answers && !onSubmit && <span className="rounded bg-warning-subtle px-2 py-0.5 text-xs text-warning">{t("survey.page.testMode")}</span>}
          <button type="button" aria-label={t("action.close")} onClick={onClose} className="grid size-7 place-items-center rounded text-fg-subtle hover:bg-surface-hover hover:text-fg">
            <Icon as={XIcon} size={15} />
          </button>
        </div>
        <div className="omni-survey min-h-0 flex-1 overflow-auto">
          <Survey model={model} />
        </div>
      </div>
    </Modal>
  );
}
