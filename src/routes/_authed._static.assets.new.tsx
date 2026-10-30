import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { PackageIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { AssetForm } from "@/features/hrms";
import { useMenu } from "@/features/sidebar";
import { useDataLanguages } from "@/features/workspace";

/** Новое имущество — property.html?new=1 прототипа. Пункт меню — в поиске. */
const searchSchema = z.object({ menu: z.string().catch("") });

export const Route = createFileRoute("/_authed/_static/assets/new")({
  validateSearch: searchSchema,
  staticData: { useCrumbs },
  component: NewAssetRoute,
});

function useCrumbs() {
  const { t } = useTranslation();
  const { menu: menuId } = Route.useSearch();
  const menu = useMenu(menuId);
  const navigate = useNavigate();

  return [
    {
      icon: PackageIcon,
      label: menu?.label || t("asset.back"),
      ...(menuId ? { onClick: () => void navigate({ to: "/m/$menuId", params: { menuId } }) } : {}),
    },
    { label: t("asset.form.new") },
  ];
}

function NewAssetRoute() {
  const { i18n } = useTranslation();
  const { menu } = Route.useSearch();
  const navigate = useNavigate();
  const router = useRouter();
  const { current: language } = useDataLanguages();

  return (
    <div className="min-h-0 flex-1 overflow-auto">
      <div className="px-6 max-md:px-3">
        <AssetForm
          guid=""
          locale={i18n.language}
          language={language}
          onSaved={(guid) => void navigate({ to: "/assets/$itemId", params: { itemId: guid }, search: { menu }, replace: true })}
          onClose={() => router.history.back()}
        />
      </div>
    </div>
  );
}
