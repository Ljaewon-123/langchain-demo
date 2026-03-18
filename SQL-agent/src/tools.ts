import { tool } from "langchain";
import * as z from "zod";
import { getDb } from "./db.js";
import { sanitizeSqlQuery } from "./sanitize.js";

/**
 * execute_sql 툴 — 에이전트가 SQL을 실행할 때 호출하는 단일 도구.
 *
 * 흐름:
 *  1. LLM이 생성한 쿼리를 sanitizeSqlQuery()로 안전성 검사
 *  2. SqlDatabase.run()으로 실제 실행
 *  3. 결과(배열 또는 문자열)를 문자열로 직렬화해 LLM에게 반환
 *  4. 실행 중 오류가 발생하면 에러 메시지를 반환 → LLM이 쿼리를 수정해 재시도
 */
export const executeSql = tool(
  async ({ query }: { query: string }) => {
    const db = await getDb();
    const safeQuery = sanitizeSqlQuery(query); // 안전성 검사 먼저
    try {
      const result = await db.run(safeQuery);
      // db.run()은 문자열 또는 객체 배열을 반환할 수 있음
      return typeof result === "string"
        ? result
        : JSON.stringify(result, null, 2);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new Error(`SQL 실행 오류: ${msg}`);
    }
  },
  {
    name: "execute_sql",
    description: "READ-ONLY SQLite SELECT 쿼리를 실행하고 결과를 반환합니다.",
    schema: z.object({
      query: z.string().describe("실행할 SQLite SELECT 쿼리 (읽기 전용)"),
    }),
  }
);
