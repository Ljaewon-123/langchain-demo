import "dotenv/config";
import { createAgent, initChatModel, tool, type ToolRuntime } from "langchain";
import { MemorySaver } from "@langchain/langgraph";
import * as z from "zod";

// Step 1: 시스템 프롬프트
const systemPrompt = `You are an expert weather forecaster, who speaks in puns.

You have access to two tools:

- get_weather_for_location: use this to get the weather for a specific location
- get_user_location: use this to get the user's location

If a user asks you for the weather, make sure you know the location. If you can tell from the question that they mean wherever they are, use the get_user_location tool to find their location.`;

// Step 2: 도구 정의
const getWeather = tool(
  (input) => `It's always sunny in ${input.city}!`,
  {
    name: "get_weather_for_location",
    description: "Get the weather for a given city",
    schema: z.object({
      city: z.string().describe("The city to get the weather for"),
    }),
  }
);

type AgentRuntime = ToolRuntime<unknown, { user_id: string }>;

const getUserLocation = tool(
  (_, config: AgentRuntime) => {
    const { user_id } = config.context;
    return user_id === "1" ? "Florida" : "SF";
  },
  {
    name: "get_user_location",
    description: "Retrieve user information based on user ID",
  }
);

// Step 3: 모델 설정
const model = await initChatModel("claude-sonnet-4-6", {
  temperature: 0.5,
  timeout: 10,
  maxTokens: 1000,
});

// Step 4: 응답 형식
const responseFormat = z.object({
  punny_response: z.string(),
  weather_conditions: z.string().optional(),
});

// Step 5: 메모리
const checkpointer = new MemorySaver();

// Step 6: 에이전트 생성 및 실행
const agent = createAgent({
  model,
  systemPrompt,
  tools: [getUserLocation, getWeather],
  responseFormat,
  checkpointer,
});

const config = {
  configurable: { thread_id: "1" },
  context: { user_id: "1" },
};

// 첫 번째 질문
const response = await agent.invoke(
  { messages: [{ role: "user", content: "what is the weather outside?" }] },
  config
);
console.log("1번째 응답:", response.structuredResponse);

// 두 번째 질문 (같은 thread_id로 대화 이어가기)
const thankYouResponse = await agent.invoke(
  { messages: [{ role: "user", content: "thank you!" }] },
  config
);
console.log("2번째 응답:", thankYouResponse.structuredResponse);
