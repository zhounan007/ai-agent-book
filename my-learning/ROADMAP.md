# 个性化学习路线

这条路线面向“概念理解 + 重点实践”，按能力里程碑推进，不绑定日期。共选 16 个核心实验，其余项目按兴趣扩展。

## M1：理解 Agent 与上下文

目标：能够解释模型、上下文、工具如何共同决定 Agent 行为。

阅读：

- [第 1 章](../book/chapter1.md)
- [第 2 章](../book/chapter2.md)

核心实验：

1. [context](../chapter1/context/)：对上下文组件做消融，观察系统提示、历史、工具记录缺失后的行为变化。
2. [kv-cache](../chapter2/kv-cache/)：先运行离线报告，再理解不同上下文组织方式为何影响缓存命中率。
3. [context-compression](../chapter2/context-compression/)：比较摘要、信息提取和语义压缩的效果与 token 成本。

阶段验收：

- 能画出一次 Agent 循环中的上下文组成。
- 能解释上下文质量、长度与成本之间的权衡。
- 至少完成一次变量对照，而不只是跑通示例。

## M2：构建记忆与检索

目标：理解长期记忆、稀疏检索、稠密检索和混合检索各自解决的问题。

阅读：

- [第 3 章](../book/chapter3.md)

核心实验：

1. [sparse-embedding](../chapter3/sparse-embedding/)：从完全离线的 BM25 CLI 开始，观察 TF、IDF 和 BM25 对排序的贡献。
2. [retrieval-pipeline](../chapter3/retrieval-pipeline/)：先跑 `--no-dense` 路径，再加入稠密检索和重排序进行比较。
3. [user-memory](../chapter3/user-memory/)：跟踪记忆的抽取、存储、检索和注入过程。

阶段验收：

- 能根据数据与查询特点选择 BM25、向量检索或混合检索。
- 能说明“对话历史”和“长期用户记忆”的区别。
- 能为记忆系统提出至少三个可测量指标。

## M3：掌握工具与 MCP

目标：理解工具的描述、发现、调用、审批和错误处理，而不仅是会调用函数。

阅读：

- [第 4 章](../book/chapter4.md)

核心实验：

1. [perception-tools](../chapter4/perception-tools/)：从无需 API Key 的搜索、天气或公共数据工具开始。
2. [execution-tools](../chapter4/execution-tools/)：先跑离线演示，重点观察审批、执行边界和结果回传。
3. [active-tool-discovery](../chapter4/active-tool-discovery/)：用离线模式比较全量注入、检索预筛选和主动发现。

阶段验收：

- 能独立设计一个输入输出清晰、错误可恢复的工具。
- 能解释为什么工具过多会消耗上下文并导致错选。
- 能说明感知工具与执行工具在风险控制上的差异。

## M4：Coding Agent 与评估

目标：把 Agent 做成可验证的工程系统，并理解能力、延迟与成本的权衡。

阅读：

- [第 5 章](../book/chapter5.md)
- [第 6 章](../book/chapter6.md)

核心实验：

1. [coding-agent](../chapter5/coding-agent/)：走读主循环和工具实现，再让它完成一个范围很小的代码任务。
2. [code-for-math](../chapter5/code-for-math/)：先离线自检沙箱，再比较纯推理与代码辅助。
3. [model-benchmark](../chapter6/model-benchmark/)：先用 `--mock` 验证指标聚合，再用小样本测真实端点。
4. [agent-cost-analysis](../chapter6/agent-cost-analysis/)：先用内置 trace 离线复算，再分析缓存与压缩的 2×2 对照。

阶段验收：

- 能描述 Coding Agent 的主循环、工具层和安全边界。
- 能为一个 Agent 设计成功率、延迟、成本和稳定性指标。
- 能区分功能自检、离线回放与真实在线评估。

## M5：自我进化与多 Agent

目标：理解经验外化、阶段化角色和多 Agent 移交的适用边界。

阅读：

- [第 8 章](../book/chapter8.md)
- [第 10 章](../book/chapter10.md)

核心实验：

1. [self-evolving-tools](../chapter8/self-evolving-tools/)：先离线验证“发现—创建—测试—注册—复用”闭环。
2. [staged-system-prompt](../chapter10/staged-system-prompt/)：观察需求、实现、审查阶段如何切换提示词和工具集。
3. [multi-role-transfer](../chapter10/multi-role-transfer/)：检查共享上下文下的角色移交链与责任边界。

阶段验收：

- 能判断何时应该增加工具、角色或独立 Agent。
- 能说明上下文共享与隔离分别带来的收益和风险。
- 完成一个综合项目设计，明确其模型、上下文、工具与评估方案。

## 选修方向

- 多模态与语音：[第 9 章](../book/chapter9.md)
- 模型训练与后训练：[第 7 章](../book/chapter7.md)
- Agentic RAG：[agentic-rag](../chapter3/agentic-rag/)
- 异步与事件驱动：[async-agent](../chapter4/async-agent/)
- 多 Agent 并行研究：[parallel-web-research](../chapter10/parallel-web-research/)

第 7 章训练实验对算力和环境要求更高，建议在完成 M1–M4 后按兴趣选择，不作为主线阻塞项。
