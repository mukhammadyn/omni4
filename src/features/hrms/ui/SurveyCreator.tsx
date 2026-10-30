import { useEffect, useState } from "react";
import { SurveyCreator as Creator, SurveyCreatorComponent } from "survey-creator-react";
import "survey-core/i18n/russian";
import "survey-creator-core/i18n/russian";
import "survey-core/survey-core.min.css";
import "survey-creator-core/survey-creator-core.fontless.min.css";
import "./survey-theme.css";
import type { Definition } from "../model/survey";

/**
 * Конструктор SurveyJS — отдельным чанком (ADR-0015): почти 3 МБ
 * библиотеки грузятся только у формы опроса.
 *
 * Облегчено: без ace-builds (необязательная зависимость Creator —
 * вкладка JSON остаётся обычным полем), без вкладок «Тема» и «Перевод».
 * Вопросы задаются один раз, при создании: переназначение `JSON` после
 * монтирования ломает выпадающие списки под StrictMode
 * (survey-react-ui, updateInputDomElement у удалённого вопроса).
 *
 * Своих переводов на узбекский у SurveyJS нет — там русский.
 */
export default function SurveyCreator({
  definition,
  locale,
  onReady,
}: {
  definition: Definition;
  locale: string;
  /** Как прочитать вопросы на «Сохранить». */
  onReady: (read: () => Definition) => void;
}) {
  const [creator] = useState(() => {
    const instance = new Creator({
      showLogicTab: true,
      showJSONEditorTab: true,
      showTranslationTab: false,
      showThemeTab: false,
      isAutoSave: false,
    });
    instance.locale = locale.startsWith("en") ? "en" : "ru";
    instance.JSON = definition;
    return instance;
  });
  useEffect(() => onReady(() => creator.JSON as Definition), [creator, onReady]);

  /* relative — панели Creator позиционируются абсолютно и без него
     растягиваются на всю страницу, поверх футера с «Сохранить». */
  return (
    <div className="omni-survey relative h-[680px] overflow-hidden rounded-lg border border-border">
      <SurveyCreatorComponent creator={creator} />
    </div>
  );
}
