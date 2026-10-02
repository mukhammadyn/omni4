import { useEffect } from "react";
import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";
import { CopilotPanel } from "@/features/copilot";
import { useProject } from "@/features/settings";
import { Sidebar } from "@/features/sidebar";
import { ensureAccessToken } from "@/shared/api/client";
import { session } from "@/shared/api/session";

/**
 * Всё под этим маршрутом требует сессии. Проверка одна и в одном месте —
 * в старом ucode guard'ы были размазаны по компонентам вперемешку
 * с проверками legacy-флагов.
 *
 * Здесь же восстанавливается access-токен: он живёт только в памяти, и
 * после перезагрузки страницы его нужно получить до первого запроса.
 * Иначе запрос уходит без Authorization, а шлюз отвечает на это 403.
 */
export const Route = createFileRoute("/_authed")({
  beforeLoad: async ({ location }) => {
    const toLogin = redirect({ to: "/login", search: { redirect: location.href } });

    if (!session.isAuthenticated()) throw toLogin;
    if (!(await ensureAccessToken())) {
      session.clear();
      throw toLogin;
    }
  },
  component: AppShell,
});

function AppShell() {
  useProjectBranding();

  return (
    /*
     * Прокрутку держат сами колонки, а не оболочка.
     *
     * По X — обрезаем, и только по X: закрытая панель помощника уезжает
     * ЗА ПРАВЫЙ край окна, а переполнение вправо браузер делает
     * прокручиваемым (влево — нет, поэтому свёрнутый сайдбар обрезать
     * не нужно). `clip`, а не `hidden`: `hidden` заводит контейнер
     * прокрутки, который потом уводит вбок весь экран на первом же
     * scrollIntoView — ровно та беда, что описана у карточки контента.
     */
    <div className="flex h-dvh overflow-x-clip">
      <Sidebar />
      {/*
        Раскладка плоская, как у прототипа (docs/REDESIGN.md, 4.1): контент
        белый во всю высоту, сайдбар — на фоне приложения, линия между
        ними — у сайдбара. Карточки с отступом и скруглением больше нет.
      */}
      {/*
        overflow-clip, а не hidden. Разница не косметическая: `hidden`
        заводит контейнер прокрутки — без полосы, но прокручиваемый
        программно. Всплывающее меню, вылезшее за правый край карточки,
        браузер «показывал» именно так: уводил всю карточку вбок вместе
        с таблицей, а вернуть её было нечем. `clip` просто обрезает.
      */}
      {/*
        z-10 — не украшение и не запас на будущее: боковые панели
        сворачиваются отрицательным отступом и на время движения
        оказываются под контентом. Лежи контент ниже, панель без своей
        заливки просвечивала бы таблицей насквозь; лежит выше — и
        сворачивание читается как «контент занял освободившееся место».
        Лестница слоёв — в app/styles.css.
      */}
      <main
        className="relative z-10 flex min-w-0 flex-1 flex-col overflow-clip bg-surface"
      >
        <Outlet />
      </main>

      {/* Помощник отодвигает контент, а не накрывает его: он правит то,
          что на экране, и таблица должна остаться видна. Смонтирован
          всегда — закрытая панель не теряет начатый разговор. */}
      <CopilotPanel />
    </div>
  );
}

/**
 * Вкладка браузера — под проект: его имя в заголовке. У человека
 * открыто пять вкладок с разными проектами, и различить их иначе
 * нечем — адрес у всех одинаковый. Значок — всегда o⁴ (см. ниже).
 *
 * Запроса нет: карточку проекта уже грузит features/workspace.
 * Заголовок возвращается на место при выходе из приложения: экран
 * входа — общий для всех проектов.
 */
function useProjectBranding() {
  const { project } = useProject();
  const title = project?.title ?? "";
  /*
   * Значок вкладки — не логотип проекта, как в админке ucode, а свой
   * o⁴ (public/favicon.svg): omni4 — продукт, и вкладка должна
   * узнаваться как он в любом проекте.
   */

  useEffect(() => {
    if (!title) return;

    document.title = title;
    return () => {
      document.title = DEFAULT_TITLE;
    };
  }, [title]);
}

/** Заголовок вкладки вне проекта — тот же, что в index.html. */
const DEFAULT_TITLE = "omni4";
