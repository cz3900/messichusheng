# 文档索引

- [recognition.md](recognition.md) —— 识别层：版式定位、逐格贴框、模板匹配、三态判定、空槽判定、读池子
- [attribution.md](attribution.md) —— 归属层：两条线索如何配对，9 个步骤各治什么病，以及该怎么收口
- [performance.md](performance.md) —— 快慢双通道、重算触发条件、引擎线程、延迟构成
- [design-2.0.md](design-2.0.md) —— **2.0 设计**：为什么 1.x 注定要一直打补丁，把问题改成"受约束的组合估计"之后能删掉什么，以及 1.x ↔ 2.0 的实测对比
- [testing.md](testing.md) —— 模拟器、真机基准、观测轨迹与回放、以及"合成测试为什么会骗人"

从零接手建议的顺序：先读根目录 [README.md](../README.md) 的"四个关键设计"，
再按 recognition → attribution → performance 读，最后读 design-2.0。
testing.md 里的方法论教训（标准答案从哪来、测试不能干扰它自己要测的东西）值得单独看一遍。

运行时有两个**互相独立**的开关（托盘菜单 / F11 / F12）：运行模式（正式 / 测试，只管截图和日志）、
状态估计内核（1.x / 2.0，只管判断）。测试模式下两个内核并行跑并逐帧记录分歧。
