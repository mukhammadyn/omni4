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
 * Значок говорит О ПОВОДЕ (письмо, репозиторий, график) — он для
 * мелких мест: строки списков. В каталоге интеграций — логотип бренда
 * (ResourceLogo ниже), как в прототипе.
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

/**
 * Логотип бренда — `.int-logo` прототипа. Файлы взяты из ugen
 * (`widgets/project-workspace/ui/resources-page.tsx`, `public/*.svg`)
 * и лежат в `public/integrations`: это картинки, а не цвета интерфейса,
 * и правиться им незачем.
 *
 * Плашка белая в обеих темах (`--color-logo-tile`): логотипы GitHub,
 * Superset и других рисованы под светлый фон и пропадают на тёмном.
 * Логотипа нет — значок типа на той же плашке.
 */
const LOGOS: Record<string, string> = {
  SMS: "sms",
  SMTP: "smtp",
  GITHUB: "github",
  GITLAB: "gitlab",
  BITBUCKET: "bitbucket",
  SUPERSET: "superset",
  METABASE: "metabase",
  TRANSCODER: "transcoder",
  MONGODB: "mongodb",
  CLICKHOUSE: "clickhouse",
  POSTGRESQL: "postgresql",
  GOOGLE_DRIVE: "google-drive",
  GOOGLE_CALENDAR: "google-calendar",
  TELEGRAM: "telegram",
  INSTAGRAM: "instagram",
  META_LEADS: "meta",
  GOOGLE_LEADS: "googleads",
};

export function ResourceLogo({ kind }: { kind: string }) {
  const logo = LOGOS[kind];

  return logo ? (
    <span className="grid size-8.5 shrink-0 place-items-center rounded-lg border border-border bg-logo-tile">
      <img src={`/integrations/${logo}.svg`} alt="" className="size-5" />
    </span>
  ) : (
    <span className="grid size-8.5 shrink-0 place-items-center rounded-lg bg-surface-hover text-fg-muted">
      <ResourceIcon kind={kind} size={18} />
    </span>
  );
}
