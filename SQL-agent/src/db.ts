import fs from "node:fs/promises";
import path from "node:path";
import { SqlDatabase } from "@langchain/classic/sql_db";
import { DataSource } from "typeorm";

// Chinook 샘플 DB (디지털 미디어 스토어 데이터)
const DB_URL =
  "https://storage.googleapis.com/benchmarks-artifacts/chinook/Chinook.db";
const LOCAL_PATH = path.resolve("Chinook.db");

/**
 * DB 파일 경로를 반환한다.
 * 로컬에 이미 파일이 있으면 그대로 사용하고,
 * 없으면 GCS에서 다운로드한 뒤 저장한다.
 */
async function resolveDbPath(): Promise<string> {
  try {
    await fs.access(LOCAL_PATH);
    console.log("✅ 로컬 DB 존재, 재사용합니다.");
    return LOCAL_PATH;
  } catch {
    console.log("⬇️  DB 다운로드 중...");
    const resp = await fetch(DB_URL);
    if (!resp.ok)
      throw new Error(`DB 다운로드 실패. Status: ${resp.status}`);
    const buf = Buffer.from(await resp.arrayBuffer());
    await fs.writeFile(LOCAL_PATH, buf);
    console.log("✅ DB 다운로드 완료.");
    return LOCAL_PATH;
  }
}

// 모듈 내에서 DB 인스턴스를 하나만 유지 (싱글톤)
let dbInstance: SqlDatabase | undefined;

/**
 * SqlDatabase 인스턴스를 반환한다.
 * 최초 호출 시 TypeORM DataSource를 초기화하고 SqlDatabase를 생성한다.
 * 이후 호출에서는 캐시된 인스턴스를 재사용한다.
 */
export async function getDb(): Promise<SqlDatabase> {
  if (!dbInstance) {
    const dbPath = await resolveDbPath();
    // TypeORM DataSource: SQLite 드라이버로 DB 파일 연결
    const datasource = new DataSource({ type: "sqlite", database: dbPath });
    // SqlDatabase: LangChain이 SQL을 실행할 수 있도록 DataSource를 래핑
    dbInstance = await SqlDatabase.fromDataSourceParams({
      appDataSource: datasource,
    });
  }
  return dbInstance;
}

/**
 * 모든 테이블의 CREATE 문(스키마)을 문자열로 반환한다.
 * 시스템 프롬프트에 주입하여 LLM이 올바른 컬럼/테이블명을 사용하도록 유도한다.
 */
export async function getSchema(): Promise<string> {
  const db = await getDb();
  return await db.getTableInfo();
}
