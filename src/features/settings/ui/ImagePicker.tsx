import { useRef } from "react";
import { LoaderCircleIcon, Trash2Icon, UploadIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useUploadFiles } from "@/features/item";
import { Button } from "@/shared/ui/button";
import { Icon } from "@/shared/ui/icon";

/**
 * Картинка настроек: фотография человека и логотип проекта.
 *
 * Файл уходит в тот же CDN, что и вложения строк (POST
 * /v1/files/folder_upload), — второй ручки для картинок у бэкенда нет,
 * и заводить свою обёртку над той же ручкой незачем.
 *
 * Наружу отдаётся ТОЛЬКО адрес: сохраняется он вместе с остальной
 * формой, по кнопке. Загрузка файла и запись профиля — разные вещи,
 * и человек, передумавший после выбора файла, не должен получить
 * чужое лицо в шапке.
 *
 * Подписи нет: это значение строки настроек (`SettingRow`), подпись
 * и пояснение у неё слева — как логотип в `.srow` прототипа.
 */
export function ImagePicker({
  value,
  letter,
  label,
  round,
  onChange,
}: {
  value: string;
  /** Чем рисовать пустое место: первой буквой имени, как в сайдбаре. */
  letter: string;
  /** Имя для читалки экрана: видимой подписи у картинки нет. */
  label: string;
  /** Круглая — у человека, квадратная со скруглением — у проекта. */
  round?: boolean;
  onChange: (url: string) => void;
}) {
  const { t } = useTranslation();
  const input = useRef<HTMLInputElement>(null);
  const upload = useUploadFiles();

  const shape = round ? "rounded-full" : "rounded-lg";

  return (
    <div className="flex items-center gap-2">
      {value && (
        <Button type="button" size="sm" variant="ghost" onClick={() => onChange("")}>
          <Icon as={Trash2Icon} size={14} />
          {t("action.delete")}
        </Button>
      )}

      {/* 40px, как плитка логотипа у прототипа. */}
      <span
        className={`grid size-10 shrink-0 place-items-center overflow-hidden bg-surface-active text-[15px] font-semibold text-fg-muted ${shape}`}
      >
        {value ? (
          // Пустой alt: подпись стоит рядом, у строки настроек.
          <img src={value} alt="" className="size-full object-cover" />
        ) : (
          letter
        )}
      </span>

      <Button
        type="button"
        size="sm"
        variant="secondary"
        disabled={upload.isPending}
        aria-label={`${t("settings.upload")}: ${label}`}
        onClick={() => input.current?.click()}
      >
        <Icon
          as={upload.isPending ? LoaderCircleIcon : UploadIcon}
          size={14}
          className={upload.isPending ? "animate-spin" : ""}
        />
        {t("settings.upload")}
      </Button>

      <input
        ref={input}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          // Значение сбрасывается сразу: иначе выбор того же файла
          // второй раз не вызовет change вовсе.
          event.target.value = "";
          if (!file) return;

          upload.mutate(
            { files: [file], folder: FOLDER },
            { onSuccess: (urls) => urls[0] && onChange(urls[0]) },
          );
        }}
      />
    </div>
  );
}

/** Папка в CDN. Та же, что у вложений строк: разделения там нет. */
const FOLDER = "ucode";
