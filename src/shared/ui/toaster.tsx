import { IconAlertTriangle, IconCheck, IconX } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { useToasts } from "../lib/toast";
import { Icon } from "./icon";

/**
 * Стопка уведомлений поверх экрана. Один экземпляр на приложение —
 * в корневом маршруте.
 *
 * Тёмная плашка внизу по центру — `.toast` прототипа. Тёмная в обеих
 * темах: класс `dark` переключает токены внутри плашки на значения
 * тёмной темы. Отсюда и цвет иконок — ошибка и успех берут ступени,
 * проверенные на тёмном фоне, а не светлые, которые на плашке не видны.
 * Своих цветов у уведомления нет, как и хардкода.
 *
 * Ошибку от успеха отличает иконка, а не заливка всей карточки.
 *
 * role="status" и aria-live: без них уведомление увидят только глазами,
 * а сообщение об ошибке — единственный след неудачного сохранения.
 */
const TONES = {
  error: "text-danger",
  success: "text-success",
};

const ICONS = {
  error: IconAlertTriangle,
  success: IconCheck,
};

export function Toaster() {
  const { t } = useTranslation();
  const items = useToasts((state) => state.items);
  const dismiss = useToasts((state) => state.dismiss);

  if (!items.length) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed bottom-6 left-1/2 z-100 flex w-max max-w-[min(32rem,calc(100vw-2rem))] -translate-x-1/2 flex-col items-center gap-2"
    >
      {items.map((item) => (
        <div
          key={item.id}
          className="dark pointer-events-auto flex items-start gap-2 rounded-lg border border-border bg-bg px-3.5 py-2 text-fg shadow-popover"
        >
          <Icon as={ICONS[item.kind]} size={16} className={`mt-0.5 shrink-0 ${TONES[item.kind]}`} />

          {/* Текст ошибки приходит с сервера и бывает длинным: переносим,
              а не обрезаем — обрезанная причина бесполезна. */}
          <p className="min-w-0 flex-1 text-sm break-words">{item.text}</p>

          <button
            type="button"
            onClick={() => dismiss(item.id)}
            aria-label={t("action.close")}
            className="-m-1 grid size-6 shrink-0 place-items-center rounded-md opacity-60 transition-opacity hover:opacity-100"
          >
            <Icon as={IconX} size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
