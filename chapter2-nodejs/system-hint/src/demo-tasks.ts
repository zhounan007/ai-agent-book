export const SMOKE_TEST_TASK =
  "请先创建 TODO，然后读取 README.md，概括这个项目如何维护 Agent 状态。";

export const STATUS_BAR_CASE_TASK = `请调查这个项目的 Agent 状态栏实现。

我听说核心实现位于 src/status-bar.ts，请进入 src 目录核实这个说法，并完成以下分析：

- 状态栏包含哪些状态
- 状态由模型维护还是代码维护
- 状态消息被插入到对话的什么位置
- replace 和 append 策略有什么区别
- 工具名称或参数错误时如何处理

最终说明我提供的文件名是否正确，并为每项结论给出源码文件路径。`;
