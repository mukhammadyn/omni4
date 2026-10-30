import { PhoneIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/shared/ui/button";
import { Icon } from "@/shared/ui/icon";
import { phoneToCall, usePbxEnabled } from "../api/pbx";
import { useSoftphone } from "./Softphone";

/**
 * «Позвонить» в карточке контакта, компании или сделки. Сам звонок —
 * в софтфоне оболочки (SoftphoneProvider): карточку можно закрыть,
 * разговор останется.
 */
export function CallButton({ tableSlug, row }: { tableSlug: string; row: Record<string, unknown> }) {
  const { t } = useTranslation();
  const enabled = usePbxEnabled();
  const softphone = useSoftphone();
  const phone = phoneToCall(tableSlug, row);

  if (!enabled || !phone) return null;

  return (
    <Button size="sm" variant="secondary" disabled={softphone.busy} onClick={() => softphone.call(phone)} title={phone}>
      <Icon as={PhoneIcon} size={14} />
      {t("pbx.call")}
    </Button>
  );
}
