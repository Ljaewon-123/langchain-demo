import "dotenv/config";

import { CheerioWebBaseLoader } from "@langchain/community/document_loaders/web/cheerio";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { HuggingFaceTransformersEmbeddings } from "@langchain/community/embeddings/huggingface_transformers";
import { ChatAnthropic } from "@langchain/anthropic";
import { createAgent, tool } from "langchain";
import type { BaseMessage } from "@langchain/core/messages";
import type { Document } from "@langchain/core/documents";
import * as z from "zod";

// ─── 1. 임베딩 모델 (로컬 HuggingFace - API 키 불필요) ───────────────────────
// 첫 실행 시 모델을 자동 다운로드합니다 (~23MB)
const embeddings = new HuggingFaceTransformersEmbeddings({
  model: "Xenova/all-MiniLM-L6-v2",
});

// ─── 2. 인메모리 벡터 스토어 ─────────────────────────────────────────────────
// langchain v1.x 에는 MemoryVectorStore 가 없어서 직접 구현
const vectors: Array<{ embedding: number[]; doc: Document }> = [];

async function addDocuments(documents: Document[]): Promise<void> {
  const texts = documents.map((d) => d.pageContent);
  const embeddingsList = await embeddings.embedDocuments(texts);
  for (let i = 0; i < documents.length; i++) {
    vectors.push({ embedding: embeddingsList[i]!, doc: documents[i]! });
  }
}

function cosineSimilarity(a: number[], b: number[]): number {
  const dot = a.reduce((sum, ai, i) => sum + ai * (b[i] ?? 0), 0);
  const magA = Math.sqrt(a.reduce((sum, ai) => sum + ai * ai, 0));
  const magB = Math.sqrt(b.reduce((sum, bi) => sum + bi * bi, 0));
  return magA && magB ? dot / (magA * magB) : 0;
}

async function similaritySearch(query: string, k: number): Promise<Document[]> {
  const queryEmbedding = await embeddings.embedQuery(query);
  return [...vectors]
    .map(({ embedding, doc }) => ({
      doc,
      score: cosineSimilarity(queryEmbedding, embedding),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
    .map(({ doc }) => doc);
}

// ─── 3. LLM 모델 (Claude) ─────────────────────────────────────────────────────
const model = new ChatAnthropic({ model: "claude-sonnet-4-6" });

// ─── 4. 웹 문서 로드 ──────────────────────────────────────────────────────────
console.log("📄 문서 로딩 중...");
const cheerioLoader = new CheerioWebBaseLoader(
  "https://lilianweng.github.io/posts/2023-06-23-agent/",
  { selector: "p" }
);
const docs = await cheerioLoader.load();

// ─── 5. 문서 청크 분할 ────────────────────────────────────────────────────────
const splitter = new RecursiveCharacterTextSplitter({
  chunkSize: 1000,
  chunkOverlap: 200,
});
const allSplits = await splitter.splitDocuments(docs);
console.log(`✂️  ${allSplits.length}개 청크로 분할 완료`);

// ─── 6. 벡터 DB 인덱싱 ───────────────────────────────────────────────────────
console.log("🔢 벡터 인덱싱 중...");
await addDocuments(allSplits);
console.log("✅ 인덱싱 완료!\n");

// ─── 7. 검색 툴 생성 ──────────────────────────────────────────────────────────
const retrieveSchema = z.object({ query: z.string() });

const retrieve = tool(
  async ({ query }) => {
    const retrievedDocs = await similaritySearch(query, 2);
    const serialized = retrievedDocs
      .map(
        (doc) =>
          `Source: ${doc.metadata.source as string}\nContent: ${doc.pageContent}`
      )
      .join("\n");
    return [serialized, retrievedDocs];
  },
  {
    name: "retrieve",
    description: "Retrieve information related to a query.",
    schema: retrieveSchema,
    responseFormat: "content_and_artifact",
  }
);

// ─── 8. 에이전트 생성 ─────────────────────────────────────────────────────────
const agent = createAgent({ model, tools: [retrieve] });

// ─── 9. 메시지 출력 헬퍼 ──────────────────────────────────────────────────────
function prettyPrint(message: BaseMessage): void {
  const type = message.type;
  const content =
    typeof message.content === "string"
      ? message.content
      : JSON.stringify(message.content, null, 2);
  console.log(`[${type}]: ${content}`);
}

// ─── 10. 질문 실행 ────────────────────────────────────────────────────────────
const inputMessage = "What is Task Decomposition?";
console.log(`❓ 질문: ${inputMessage}\n`);

for await (const step of await agent.stream(
  { messages: [{ role: "user", content: inputMessage }] },
  { streamMode: "values" }
)) {
  const lastMessage = step.messages.at(-1);
  if (lastMessage) {
    prettyPrint(lastMessage);
    console.log("-----\n");
  }
}
