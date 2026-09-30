import {
  ChartColumnBigIcon,
  ChartColumnIcon,
  DatabaseIcon,
  GitBranchIcon,
  MailIcon,
  MessageSquareTextIcon,
  PlugIcon,
  SendIcon,
  VideoIcon,
  WebhookIcon,
} from "lucide-react";
import { Icon } from "@/shared/ui/icon";

/**
 * Значок типа ресурса.
 *
 * Отдельным файлом, потому что нужен в двух местах — в строке списка
 * и в плитке выбора типа, — и потому что это единственное место, где
 * имя типа превращается в картинку.
 *
 * Логотипов вендоров тут нет намеренно: своя картинка на каждый тип
 * означала бы двадцать файлов в public и своё поведение в тёмной теме.
 * Значок говорит О ПОВОДЕ (письмо, репозиторий, график), а имя службы
 * написано рядом словами.
 */
const ICONS: Record<string, typeof WebhookIcon> = {
  SMS: MessageSquareTextIcon,
  SMTP: MailIcon,
  MAILCHIMP: SendIcon,
  GITHUB: GitBranchIcon,
  GITLAB: GitBranchIcon,
  SUPERSET: ChartColumnIcon,
  METABASE: ChartColumnBigIcon,
  TRANSCODER: VideoIcon,
  REST: WebhookIcon,
  MONGODB: DatabaseIcon,
  CLICKHOUSE: DatabaseIcon,
  POSTGRESQL: DatabaseIcon,
};

export function ResourceIcon({ kind, size = 16 }: { kind: string; size?: number }) {
  return <Icon as={ICONS[kind] ?? PlugIcon} size={size} />;
}
