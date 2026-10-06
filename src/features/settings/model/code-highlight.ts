/**
 * Подсветка кода для чтения — SDK и DBML, `DX.hl` прототипа: комментарии,
 * строки, ключевые слова, числа. Один разбор на JavaScript, Python, cURL
 * и DBML: код здесь только смотрят и копируют, а для этого хватает
 * четырёх цветов, общих у всех четырёх языков.
 *
 * Не SQL: у консоли свой разбор (`sql-syntax`) — там подсказка по слову
 * под курсором и параметры, и общий с ним разбор пришлось бы учить и тому,
 * и другому.
 */
export type CodeTokenKind = "keyword" | "string" | "comment" | "number" | "plain";

export type CodeToken = { text: string; kind: CodeTokenKind };

const KEYWORDS =
  "const|let|async|function|await|return|import|from|def|class|if|else|for|in|new|try|catch|curl|Table|Ref";

/*
 * Порядок групп — порядок важности: строка и комментарий начинаются
 * раньше, чем слова внутри них, поэтому `//` в адресе внутри кавычек
 * остаётся строкой, а `in` в комментарии — комментарием.
 */
const TOKEN = new RegExp(
  `(\\/\\/.*$|#.*$)|('(?:[^'\\\\\\n]|\\\\.)*'|"(?:[^"\\\\\\n]|\\\\.)*"|\`[^\`]*\`)|\\b(${KEYWORDS})\\b|\\b(\\d+(?:\\.\\d+)?)\\b`,
  "g",
);

/** Код → строки → лексемы. Пробелы остаются в `plain`: отступ — часть кода. */
export function highlightCode(source: string): CodeToken[][] {
  return source.split("\n").map((line) => {
    const tokens: CodeToken[] = [];
    let last = 0;

    for (const match of line.matchAll(TOKEN)) {
      const start = match.index;
      if (start > last) tokens.push({ text: line.slice(last, start), kind: "plain" });

      const kind: CodeTokenKind = match[1]
        ? "comment"
        : match[2]
          ? "string"
          : match[3]
            ? "keyword"
            : "number";
      tokens.push({ text: match[0], kind });
      last = start + match[0].length;
    }

    if (last < line.length) tokens.push({ text: line.slice(last), kind: "plain" });
    return tokens;
  });
}
