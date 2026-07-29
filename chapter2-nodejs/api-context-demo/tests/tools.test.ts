import { describe, expect, it, vi } from "vitest";
import { executeTool } from "../src/tools.js";

const BASE_CONTEXT = {
  baiduMapAK: "test-ak",
  baiduWeatherBaseURL: "https://api.map.baidu.com/weather/v1/",
};

describe("executeTool", () => {
  it("formats the current time in the requested timezone", async () => {
    const result = await executeTool(
      "get_current_time",
      JSON.stringify({ timezone: "Asia/Shanghai" }),
      {
        ...BASE_CONTEXT,
        now: new Date("2026-07-27T04:00:00.000Z"),
      },
    );

    expect(JSON.parse(result)).toMatchObject({
      timezone: "Asia/Shanghai",
      iso_utc: "2026-07-27T04:00:00.000Z",
    });
    expect(JSON.parse(result).datetime).toContain("12:00:00");
  });

  it("calls Baidu Weather and maps its current-weather fields", async () => {
    const fetchMock = vi.fn(async (_input: string | URL | Request) => {
      return new Response(
        JSON.stringify({
          status: 0,
          result: {
            location: {
              country: "中国",
              province: "北京市",
              city: "北京市",
              name: "海淀区",
              id: "110108",
            },
            now: {
              temp: 31,
              feels_like: 33,
              rh: 62,
              wind_class: "2级",
              wind_dir: "东南风",
              text: "多云",
              aqi: 42,
              uptime: "20260727120000",
            },
          },
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    });

    const result = await executeTool(
      "get_current_weather",
      JSON.stringify({
        province: "北京市",
        city: "北京市",
        district: "海淀区",
      }),
      { ...BASE_CONTEXT, fetchImpl: fetchMock },
    );

    const calledURL = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(calledURL.searchParams.get("province")).toBe("北京市");
    expect(calledURL.searchParams.get("city")).toBe("北京市");
    expect(calledURL.searchParams.get("district")).toBe("海淀区");
    expect(calledURL.searchParams.get("data_type")).toBe("now");
    expect(calledURL.searchParams.get("ak")).toBe("test-ak");
    expect(JSON.parse(result)).toMatchObject({
      location: { district: "海淀区", district_id: "110108" },
      weather: {
        temperature_celsius: 31,
        conditions: "多云",
        humidity_percent: 62,
      },
    });
  });

  it("returns a structured error for invalid tool arguments", async () => {
    const result = await executeTool(
      "get_current_time",
      "{not-json}",
      BASE_CONTEXT,
    );

    expect(JSON.parse(result)).toEqual({
      error: "工具参数不是有效的 JSON。",
    });
  });
});
