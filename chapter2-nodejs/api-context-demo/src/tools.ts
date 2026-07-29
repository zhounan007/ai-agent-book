import type OpenAI from "openai";

export interface ToolContext {
  baiduMapAK: string;
  baiduWeatherBaseURL: string;
  fetchImpl?: typeof fetch;
  now?: Date;
}

interface CurrentTimeArguments {
  timezone: string;
}

interface WeatherArguments {
  province?: string;
  city?: string;
  district: string;
}

interface BaiduWeatherResponse {
  status?: number;
  message?: string;
  result?: {
    location?: {
      country?: string;
      province?: string;
      city?: string;
      name?: string;
      id?: string;
    };
    now?: {
      temp?: number;
      feels_like?: number;
      rh?: number;
      wind_class?: string;
      wind_dir?: string;
      text?: string;
      prec_1h?: number;
      clouds?: number;
      vis?: number;
      aqi?: number;
      uptime?: string;
    };
  };
}

export const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "get_current_time",
      description: "查询指定 IANA 时区的当前日期、时间和星期。",
      parameters: {
        type: "object",
        properties: {
          timezone: {
            type: "string",
            description: "IANA 时区名称，例如 Asia/Shanghai。",
          },
        },
        required: ["timezone"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_current_weather",
      description: "通过百度天气 API 查询中国大陆指定省、市、区县的实时天气。",
      parameters: {
        type: "object",
        properties: {
          province: {
            type: "string",
            description: "省级行政区名称，例如北京市、山东省。",
          },
          city: {
            type: "string",
            description: "城市名称，例如北京市、济南市。",
          },
          district: {
            type: "string",
            description: "区县名称，例如海淀区、历下区。",
          },
        },
        required: ["district"],
        additionalProperties: false,
      },
    },
  },
];

function parseArguments<T>(rawArguments: string): T {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawArguments);
  } catch {
    throw new Error("工具参数不是有效的 JSON。");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("工具参数必须是 JSON 对象。");
  }
  return parsed as T;
}

function getCurrentTime(rawArguments: string, now = new Date()): string {
  const { timezone } = parseArguments<CurrentTimeArguments>(rawArguments);
  if (typeof timezone !== "string" || !timezone.trim()) {
    throw new Error("get_current_time 缺少 timezone 参数。");
  }

  let formatted: string;
  try {
    formatted = new Intl.DateTimeFormat("zh-CN", {
      timeZone: timezone,
      dateStyle: "full",
      timeStyle: "long",
      hour12: false,
    }).format(now);
  } catch {
    throw new Error(`无效的 IANA 时区：${timezone}`);
  }

  return JSON.stringify({
    timezone,
    datetime: formatted,
    iso_utc: now.toISOString(),
  });
}

async function getCurrentWeather(
  rawArguments: string,
  context: ToolContext,
): Promise<string> {
  const { province, city, district } =
    parseArguments<WeatherArguments>(rawArguments);
  if (typeof district !== "string" || !district.trim()) {
    throw new Error("get_current_weather 缺少 district 参数。");
  }
  if (!context.baiduMapAK.trim()) {
    throw new Error("缺少百度地图 AK，无法查询天气。");
  }

  const url = new URL(context.baiduWeatherBaseURL);
  url.searchParams.set("district", district);
  if (province?.trim()) url.searchParams.set("province", province);
  if (city?.trim()) url.searchParams.set("city", city);
  url.searchParams.set("data_type", "now");
  url.searchParams.set("output", "json");
  url.searchParams.set("ak", context.baiduMapAK);

  const fetchImpl = context.fetchImpl ?? fetch;
  const response = await fetchImpl(url, {
    method: "GET",
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    throw new Error(`百度天气 API 请求失败：HTTP ${response.status}`);
  }

  const payload = (await response.json()) as BaiduWeatherResponse;
  if (typeof payload.status === "number" && payload.status !== 0) {
    throw new Error(
      `百度天气 API 返回错误：${payload.status} ${payload.message ?? ""}`.trim(),
    );
  }
  if (!payload.result?.now) {
    throw new Error("百度天气 API 未返回实时天气数据。");
  }

  const { location, now } = payload.result;
  return JSON.stringify({
    location: {
      country: location?.country,
      province: location?.province,
      city: location?.city,
      district: location?.name,
      district_id: location?.id,
    },
    weather: {
      temperature_celsius: now.temp,
      feels_like_celsius: now.feels_like,
      humidity_percent: now.rh,
      conditions: now.text,
      wind_direction: now.wind_dir,
      wind_class: now.wind_class,
      precipitation_1h_mm: now.prec_1h,
      visibility_m: now.vis,
      aqi: now.aqi,
      updated_at: now.uptime,
    },
  });
}

export async function executeTool(
  name: string,
  rawArguments: string,
  context: ToolContext,
): Promise<string> {
  try {
    switch (name) {
      case "get_current_time":
        return getCurrentTime(rawArguments, context.now);
      case "get_current_weather":
        return await getCurrentWeather(rawArguments, context);
      default:
        throw new Error(`未知工具：${name}`);
    }
  } catch (error) {
    return JSON.stringify({
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
