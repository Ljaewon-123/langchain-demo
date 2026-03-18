# SQL Agent

LangChain의 `createAgent`와 Claude를 사용해 자연어 질문을 SQL 쿼리로 변환하고 SQLite DB를 조회하는 ReAct 에이전트입니다.

## 구조

```
SQL-agent/
├── src/
│   ├── db.ts         DB 연결 및 스키마 조회
│   ├── sanitize.ts   SQL 안전성 검사
│   ├── tools.ts      execute_sql 툴 정의
│   └── agent.ts      에이전트 생성 및 export
├── run.ts            실행 진입점
├── .env              API 키 (직접 생성 필요)
└── Chinook.db        SQLite 샘플 DB (최초 실행 시 자동 다운로드)
```

## 코드 흐름

### 1. 시작 (`run.ts`)

```
dotenv 로드 → agent import → 질문 순서대로 실행
```

`run.ts`가 `src/agent.js`를 import하는 순간, ESM 모듈 시스템이 `agent.ts`를 평가(evaluate)합니다.

---

### 2. 에이전트 초기화 (`src/agent.ts`)

```
모듈 로드
  └─ buildSystemPrompt() 호출  ← top-level await
       └─ getSchema() 호출
            └─ getDb() 호출
                 └─ resolveDbPath()   DB 파일 확인 또는 다운로드
                 └─ SqlDatabase 초기화
            └─ db.getTableInfo()      테이블 CREATE 문 수집
       └─ SystemMessage 생성          스키마를 프롬프트에 포함
  └─ createAgent({ model, tools, systemPrompt })
```

`createAgent`는 내부적으로 LangGraph의 ReAct 그래프를 구성합니다.
스키마를 프롬프트에 포함시켜 LLM이 존재하지 않는 테이블/컬럼을 만들어 내는 **환각을 방지**합니다.

---

### 3. 질문 처리 (ReAct 루프)

```
user 메시지 입력
  └─ [ai] 질문 분석 → SQL 쿼리 생성 → execute_sql 툴 호출 요청
       └─ [tool] sanitizeSqlQuery()   안전성 검사
                  └─ 복수 문장 차단
                  └─ SELECT 전용 강제
                  └─ DML/DDL 키워드 차단
                  └─ LIMIT 자동 추가
            └─ db.run(safeQuery)      SQLite 실행
            └─ 결과 반환
  └─ [ai] 결과 해석 → 최종 답변 생성
       (오류 발생 시 최대 5회 재시도)
```

`streamMode: "values"` 옵션을 사용하면 각 스텝(메시지 추가될 때마다)의 전체 상태 스냅샷을 받습니다.
매 스냅샷에서 `messages.at(-1)`로 가장 최근 메시지만 출력합니다.

---

### 4. 메시지 타입별 흐름 예시

```
[human]  평균적으로 가장 긴 트랙을 가진 장르는?
[ai]     (툴 호출: execute_sql)
[tool]   [{"GenreName":"Sci Fi & Fantasy","AvgMs":2911783}]
[ai]     Sci Fi & Fantasy 장르가 평균 약 48.5분으로 가장 긴 트랙을 가지고 있습니다.
```

---

## 설치 및 실행

```bash
# 패키지 설치
npm install

# .env 파일 생성
echo "ANTHROPIC_API_KEY=your-api-key-here" > .env

# 실행 (tsx 사용)
npx tsx run.ts
```

## 사용 패키지

| 패키지 | 용도 |
|---|---|
| `langchain` | `createAgent`, `tool`, `SystemMessage` |
| `@langchain/anthropic` | Claude 모델 |
| `@langchain/classic` | `SqlDatabase` (SQL 실행 래퍼) |
| `typeorm` + `sqlite3` | SQLite DB 드라이버 |
| `zod` | 툴 입력 스키마 검증 |
| `dotenv` | 환경변수 로드 |
