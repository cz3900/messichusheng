#!/usr/bin/env python3
"""把 data/lib.bin(513×12288 float32, 25MB)量化成 int8 + 每向量 scale(6.3MB)。
每个向量已经是"去通道均值 + 单位化"的, 数值集中在 ±0.05, 用 每向量 max 做对称量化:
   q = round(v / s * 127), s = max|v|;  点积 = Σ q·u * (s/127)
12288 维求和把量化噪声平均掉, 实测点积误差 ~1e-4 量级, 而行匹配裕度是 0.16 —— 差 3 个数量级。"""
import numpy as np, json, os
D = os.path.join(os.path.dirname(__file__), "..", "data")
keys = json.load(open(os.path.join(D, "lib_keys.json")))
v = np.fromfile(os.path.join(D, "lib.bin"), dtype=np.float32).reshape(len(keys), -1)
s = np.abs(v).max(axis=1); s[s == 0] = 1e-9
q = np.rint(v / s[:, None] * 127).clip(-127, 127).astype(np.int8)
q.tofile(os.path.join(D, "lib_i8.bin")); (s / 127).astype(np.float32).tofile(os.path.join(D, "lib_scale.bin"))
deq = q.astype(np.float32) * (s / 127)[:, None]
err = np.abs(deq - v).max()
# 用真实的"格子向量"做一次点积误差抽查:拿库里 200 个向量当查询
qy = v[:200]
d0 = qy @ v.T; d1 = qy @ deq.T
print(f"元素最大误差 {err:.2e}; 点积最大误差 {np.abs(d0-d1).max():.2e}; "
      f"排名第一是否一致: {(d0.argmax(1)==d1.argmax(1)).mean()*100:.1f}%; "
      f"体积 {v.nbytes/1e6:.1f}MB → {q.nbytes/1e6:.1f}MB")
