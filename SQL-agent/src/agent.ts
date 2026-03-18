import { createAgent, SystemMessage } from "langchain";
import { ChatAnthropic } from "@langchain/anthropic";
import { getSchema } from "./db.js";
import { executeSql } from "./tools.js";

// Claude Sonnet 모델 초기화 (ANTHROPIC_API_KEY 환경변수 자동 사용)
const model = new ChatAnthropic({ model: "claude-sonnet-4-6" });

/**
 * DB 스키마를 조회한 뒤 시스템 프롬프트를 생성한다.
 *
 * 스키마를 프롬프트에 포함시키는 이유:
 *   LLM이 존재하지 않는 테이블/컬럼을 만들어 내는 "환각"을 방지하기 위해
 *   실제 CREATE 문을 컨텍스트로 주입한다.
 */
async function buildSystemPrompt(): Promise<SystemMessage> {
  const schema = await getSchema();
  return new SystemMessage(`당신은 신중한 SQLite 분석가입니다.

공식 스키마 (아래에 없는 컬럼/테이블은 만들지 마세요):
${schema}

규칙:
- 단계적으로 생각하세요.
- 데이터가 필요할 때는 \`execute_sql\` 툴을 호출하여 SELECT 쿼리 하나를 실행하세요.
- 읽기 전용만 허용: INSERT/UPDATE/DELETE/ALTER/DROP/CREATE/REPLACE/TRUNCATE 금지.
- 사용자가 명시하지 않는 한 결과는 5행으로 제한하세요.
- 툴이 'Error:'를 반환하면 SQL을 수정하여 다시 시도하세요.
- 최대 5번 시도 후 성공하지 못하면 사용자에게 안내하세요.
- SELECT * 대신 명시적 컬럼 목록을 사용하세요.
`);
}

/**
 * ReAct 에이전트를 생성하고 export한다.
 *
 * - systemPrompt: 모듈 로드 시 top-level await으로 미리 계산
 *   (createAgent는 string | SystemMessage만 받으므로 비동기 함수를 직접 전달할 수 없음)
 * - tools: LLM이 호출할 수 있는 도구 목록 (현재는 execute_sql 하나)
 */
export const agent = createAgent({
  model,
  tools: [executeSql],
  systemPrompt: await buildSystemPrompt(), // top-level await (ESM 전용)
});
