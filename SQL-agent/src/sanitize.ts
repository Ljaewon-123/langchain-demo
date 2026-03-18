// DML/DDL 키워드를 차단하는 정규식
const DENY_RE =
  /\b(INSERT|UPDATE|DELETE|ALTER|DROP|CREATE|REPLACE|TRUNCATE)\b/i;

// 쿼리 끝에 LIMIT N 이 이미 있는지 확인하는 정규식
const HAS_LIMIT_RE = /\blimit\b\s+\d+(\s*,\s*\d+)?\s*;?\s*$/i;

/**
 * LLM이 생성한 SQL 쿼리를 실행 전에 검증·정제한다.
 *
 * 검사 항목:
 * 1. 복수 문장 차단 — 세미콜론이 2개 이상이면 오류
 * 2. SELECT 전용 강제 — SELECT로 시작하지 않으면 오류
 * 3. DML/DDL 키워드 차단 — INSERT, DROP 등이 포함되면 오류
 * 4. LIMIT 자동 추가 — LIMIT 절이 없으면 "LIMIT 5" 를 붙여 대량 조회를 방지
 */
export function sanitizeSqlQuery(q: unknown): string {
  let query = String(q ?? "").trim();

  // 1. 복수 문장 차단 (세미콜론이 2개 이상이거나, 끝 세미콜론 앞에 또 세미콜론이 있는 경우)
  const semis = [...query].filter((c) => c === ";").length;
  if (
    semis > 1 ||
    (query.endsWith(";") && query.slice(0, -1).includes(";"))
  ) {
    throw new Error("복수의 SQL 문장은 허용되지 않습니다.");
  }
  // 끝에 붙은 세미콜론 제거 (TypeORM이 이중 세미콜론을 오류로 처리할 수 있음)
  query = query.replace(/;+\s*$/g, "").trim();

  // 2. SELECT 전용 강제
  if (!query.toLowerCase().startsWith("select")) {
    throw new Error("SELECT 문만 허용됩니다.");
  }

  // 3. DML/DDL 키워드 차단
  if (DENY_RE.test(query)) {
    throw new Error("DML/DDL이 감지되었습니다. 읽기 전용 쿼리만 가능합니다.");
  }

  // 4. LIMIT 없으면 자동 추가 (LLM이 빠뜨리는 경우 대비)
  if (!HAS_LIMIT_RE.test(query)) {
    query += " LIMIT 5";
  }
  return query;
}
