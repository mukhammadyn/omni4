import {
  BarcodeIcon,
  BracesIcon,
  CalendarClockIcon,
  CalendarIcon,
  CaseSensitiveIcon,
  CircleDotIcon,
  ClockIcon,
  CodeIcon,
  FingerprintIcon,
  GlobeIcon,
  HashIcon,
  HeadingIcon,
  ImageIcon,
  LinkIcon,
  ListIcon,
  LockIcon,
  MailIcon,
  MapPinIcon,
  PaletteIcon,
  PaperclipIcon,
  PentagonIcon,
  PhoneIcon,
  QrCodeIcon,
  SigmaIcon,
  SmileIcon,
  SquareCheckIcon,
  TextAlignStartIcon,
  ZapIcon,
  type LucideIcon,
} from "lucide-react";
import { cellKind, type CellKind } from "../model/cell-kind";

/**
 * Иконка по типу поля. Одна на всё: заголовок колонки, чип фильтра
 * и список типов при создании поля должны показывать одно и то же —
 * иначе одно поле выглядит тремя разными сущностями.
 *
 * Ищется сначала по типу, потом по ВИДУ ячейки. Второй шаг важнее
 * первого: видов пятнадцать, типов сорок, и новый тип получает
 * осмысленную иконку сам, а не «Abc» — ровно так LINK и оказался
 * подписан как строка.
 */
const BY_KIND: Record<CellKind, LucideIcon> = {
  text: CaseSensitiveIcon,
  // Подпись-разделитель (TEXT), а не текст записи: значок тот же,
  // что у выбора заголовка карточки.
  label: HeadingIcon,
  longtext: TextAlignStartIcon,
  number: HashIcon,
  boolean: SquareCheckIcon,
  date: CalendarIcon,
  datetime: CalendarClockIcon,
  datetime_naive: CalendarClockIcon,
  time: ClockIcon,
  status: CircleDotIcon,
  multiselect: ListIcon,
  relation: LinkIcon,
  image: ImageIcon,
  file: PaperclipIcon,
  color: PaletteIcon,
  icon: SmileIcon,
  map: MapPinIcon,
  polygon: PentagonIcon,
  json: BracesIcon,
  formula: SigmaIcon,
  qr: QrCodeIcon,
  barcode: BarcodeIcon,
  scanner: BarcodeIcon,
  password: LockIcon,
  link: GlobeIcon,
  button: ZapIcon,
};

/** Типы, которые внутри своего вида всё же различаются на глаз. */
const BY_TYPE: Record<string, LucideIcon> = {
  EMAIL: MailIcon,
  PHONE: PhoneIcon,
  INTERNATION_PHONE: PhoneIcon,
  UUID: FingerprintIcon,
  RANDOM_UUID: FingerprintIcon,
  RANDOM_TEXT: FingerprintIcon,
  PRIMARY_KEY: FingerprintIcon,
  INCREMENT_ID: FingerprintIcon,
  INCREMENT_NUMBER: FingerprintIcon,
  FORMULA: SigmaIcon,
  FORMULA_FRONTEND: SigmaIcon,
  // Тоже собранное значение, но строка, а не число.
  MANUAL_STRING: SigmaIcon,
  CODE: CodeIcon,
  PROGRAMMING_LANGUAGE: CodeIcon,
  MAP: MapPinIcon,
  PICK_LIST: ListIcon,
};

export function fieldIcon(type: string): LucideIcon {
  return BY_TYPE[type] ?? BY_KIND[cellKind(type)];
}
