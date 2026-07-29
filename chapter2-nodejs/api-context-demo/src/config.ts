import "dotenv/config";

export interface DemoConfig {
  dashscopeApiKey: string;
  dashscopeBaseURL: string;
  model: string;
  baiduMapAK: string;
  baiduWeatherBaseURL: string;
  maxIterations: number;
}

export const DEFAULT_DASHSCOPE_BASE_URL =
  "https://dashscope.aliyuncs.com/compatible-mode/v1";
export const DEFAULT_MODEL = "qwen3.7-plus";
export const DEFAULT_BAIDU_WEATHER_BASE_URL =
  "https://api.map.baidu.com/weather/v1/";

function readPositiveInteger(name: string, fallback: number): number {
  const parsed = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function requireEnvironmentVariable(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`缺少环境变量 ${name}。请参考 env.example 配置。`);
  }
  return value;
}

export function loadConfig(): DemoConfig {
  return {
    dashscopeApiKey: requireEnvironmentVariable("DASHSCOPE_API_KEY"),
    dashscopeBaseURL:
      process.env.DASHSCOPE_BASE_URL?.trim() || DEFAULT_DASHSCOPE_BASE_URL,
    model: process.env.DASHSCOPE_MODEL?.trim() || DEFAULT_MODEL,
    baiduMapAK: requireEnvironmentVariable("BAIDU_MAP_AK"),
    baiduWeatherBaseURL:
      process.env.BAIDU_WEATHER_BASE_URL?.trim() ||
      DEFAULT_BAIDU_WEATHER_BASE_URL,
    maxIterations: readPositiveInteger("MAX_AGENT_ITERATIONS", 5),
  };
}
