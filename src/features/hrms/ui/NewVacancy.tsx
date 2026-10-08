import { useTranslation } from "react-i18next";
import { useNewVacancy } from "../api/vacancy-new";
import { VacancyForm } from "./VacancyForm";

/**
 * «Создать» вакансию — vacancy.html?new=1 прототипа: та же форма,
 * что «Редактировать», с умолчаниями новой вакансии (useNewVacancy).
 * Создали — на страницу вакансии.
 */
export function NewVacancy({
  locale,
  language,
  onCreated,
  onCancel,
}: {
  locale: string;
  language: string;
  onCreated: (guid: string) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const form = useNewVacancy();

  if (form.isLoading) return <p className="p-8 text-center text-sm text-fg-subtle">{t("common.loading")}</p>;

  return (
    <VacancyForm
      /* Черновик собран после загрузки воронок — форма заводится с ним. */
      key={String(form.draft.guid)}
      row={form.draft}
      fields={form.fields}
      relations={form.relations}
      creating
      pending={form.pending}
      locale={locale}
      language={language}
      onSave={(values) => form.create(values, onCreated)}
      onClose={onCancel}
    />
  );
}
