import { useMemo } from "react";
import { uploadFolder, useCreateItem, useUpdateItem, useUploadFiles } from "@/features/item";
import { firstText, related, text } from "./org";
import { useAll } from "./timesheet";
import { VACANCIES } from "./vacancy";

/**
 * «Карьерный сайт» — `careerInit` прототипа: одна строка `hr_career_site`.
 *
 * Публичную страницу `<поддомен>.hrms.udevs.io` пока отдаёт старый HRMS:
 * настройки она читает функцией `career_site_get` своего проекта, а не
 * omni4. Уникальность поддомена между компаниями проверяет та же функция —
 * здесь только формат.
 */
const TABLE = "hr_career_site";
export const CAREER_DOMAIN = "hrms.udevs.io";

export type CareerSite = {
  enabled: boolean;
  subdomain: string;
  title: string;
  seo_description: string;
  primary_color: string;
  accent_color: string;
  logo: string;
  favicon: string;
  background: string;
  hero_title: string;
  hero_subtitle: string;
  about: string;
  contact_email: string;
  website: string;
};
const KEYS = [
  "subdomain",
  "title",
  "seo_description",
  "primary_color",
  "accent_color",
  "logo",
  "favicon",
  "background",
  "hero_title",
  "hero_subtitle",
  "about",
  "contact_email",
  "website",
] as const;

export const EMPTY_SITE: CareerSite = {
  enabled: false,
  ...(Object.fromEntries(KEYS.map((k) => [k, ""])) as Omit<CareerSite, "enabled">),
  primary_color: "#465FFF",
  accent_color: "#7C4DFF",
};

export type PreviewVacancy = { id: string; title: string; department: string; location: string; format: string };

export function useCareerSite() {
  const rows = useAll(TABLE, {}, false);
  // ponytail: все вакансии и отбор на клиенте — у SWITCH в фильтре get-list своя запись значения.
  const vacancies = useAll(VACANCIES, {});
  const create = useCreateItem(TABLE);
  const update = useUpdateItem(TABLE);
  const upload = useUploadFiles();
  const row = rows.rows[0];

  const site = useMemo<CareerSite>(
    () =>
      row
        ? {
            enabled: row.enabled === true,
            ...(Object.fromEntries(KEYS.map((k) => [k, text(row[k])])) as Omit<CareerSite, "enabled">),
          }
        : EMPTY_SITE,
    [row],
  );
  const published = useMemo<PreviewVacancy[]>(
    () =>
      vacancies.rows
        .filter((v) => v.is_published === true)
        .map((v) => ({
          id: text(v.guid),
          title: text(v.title),
          department: text(related(v, "hr_departments_id").name),
          location: text(related(v, "hr_locations_id").name),
          format: firstText(v.work_format),
        })),
    [vacancies.rows],
  );

  return {
    site,
    published,
    loading: rows.loading,
    saving: create.isPending || update.isPending,
    uploading: upload.isPending,
    /** Строка одна на проект: нет — заводится. */
    save: (next: CareerSite) =>
      row ? update.mutateAsync({ guid: text(row.guid), values: next }) : create.mutateAsync({ guid: crypto.randomUUID(), ...next }),
    upload: (file: File) => upload.mutateAsync({ files: [file], folder: uploadFolder({}) }).then((urls) => urls[0] ?? ""),
  };
}
