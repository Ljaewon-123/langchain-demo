import "dotenv/config"; // .env 파일에서 환경변수 로드 (ANTHROPIC_API_KEY 등)
import { agent } from "./src/agent.js";

// 에이전트에게 던질 질문 목록
const questions = [
  "평균적으로 가장 긴 트랙을 가진 장르는?",
  "상위 5명의 고객 이름과 총 구매금액을 알려줘",
];

for (const question of questions) {
  console.log("\n" + "=".repeat(60));
  console.log(`❓ 질문: ${question}`);
  console.log("=".repeat(60));

  // streamMode: "values" → 매 스텝마다 전체 상태(state)를 스냅샷으로 받음
  // 각 스냅샷의 messages 배열에서 마지막 메시지만 출력
  const stream = await agent.stream(
    { messages: [{ role: "user", content: question }] },
    { streamMode: "values" }
  );

  for await (const step of stream) {
    const message = step.messages?.at(-1);
    if (!message) continue;

    // message.type: "human" | "ai" | "tool" 등
    console.log(`\n[${message.type}]`);

    // content가 문자열이면 그대로, 객체(툴 호출 블록 등)면 JSON으로 출력
    const content =
      typeof message.content === "string"
        ? message.content
        : JSON.stringify(message.content, null, 2);
    console.log(content);
  }
}
