/* AD 胜负打分器 —— 纯前端,不需要服务端推理。
 *
 * 输入:seats = 10 个座位,每个座位 5 个 key(1 个 "hero:<id>" + 4 个技能 key,顺序随意)。
 *       前 5 个座位是左方,后 5 个是右方。
 * 输出:logit(反对称,交换左右直接变号)和左方胜率。
 *
 * 模型结构(和训练端 exp_ffm.py 一字不差):
 *   座位内   f = ⟨uA[本体], Σ uH[技能]⟩ + ½(‖Σ uA[技能]‖² − Σ‖uA[技能]‖²)
 *            第一项是"本体×技能",第二项是"技能×技能",用两张不同的向量表 —— 关系分型
 *   跨座位   同队 5 个座位之间的配合,用 rank-1 的 cH/cA
 *   z = Σ_座位 ±( Σw + 座位内 + 跨座位 )
 *
 * 先手截距没有导出:模拟器里没有天辉/夜魇,左右完全对称。
 */
window.ADScore = (function () {
  var M = null, W, uA, uH, cH, cA, K, K2, idx, PLAIN = false;
  var KS, FW = null, KNOT, TH, AV = null, SAX, AMU, ASD, NAX = 0;
  var CL = null, CP = null, NCL = 0;   // 簇对项:每件东西的簇标签 + K(K+1)/2 个系数
  /* 归因层(只改"单件/配合"两栏怎么分账,座位总分逐项恒等) */
  var RG = null, RMU = 0, BREF = 0.234, TP = null;
  /* 玩家意见压缩表(2026-09-08):中×低 / 低×低 顺位格里、玩家有机会凑却不凑的正配合,按 f=残差² 压。
     SQ: key(a*n+b, a<b) → {d: 压掉的分(负数, 直接加进配合项), f: 系数}。负配合分不在表里。这一项改总分。 */
  var SQ = null;
  /* 小样本正配合收缩(2026-09-09):同座位共现 n 少的对,正配合分乘 g=n/(n+60);负的不动。
     GK 是上三角 uint8(g×255),下标 a<b: a*(2n−a−1)/2+(b−a−1)。改总分。 */
  var GK = null;
  /* 逐对修正层(2026-09-25, tools/build-pf.py):线上底座冻结,每对一个固定修正 δ 直接加进座位配合项(不进 g 收缩)。
     训练时用"人类认可度"(有机会凑时真的凑的比例)当先验:认可度高的对默认偏强、少收缩。PF 是上三角 Int16(δ/pfs),下标同 GK。改总分。 */
  var PF = null, PFS = 1e-4;
  /* 全数据保守三件修正: A+B 的调整与 C 到齐的增量分别计入同座分。 */
  var TRP = null, TRT = null;
  function trioPairKey(a, b) { if (a > b) { var t = a; a = b; b = t; } return a * M.n + b; }
  function trioKey(a, b, c) { var t; if (a > b) { t = a; a = b; b = t; } if (b > c) { t = b; b = c; c = t; } if (a > b) { t = a; a = b; b = t; } return (a * M.n + b) * M.n + c; }
  /* 条件收缩(2026-09-18):一对配合的证据六成以上来自带某第三件 c 的座位时,座位缺 c 就改用"缺 c 的共现局数"算 g。
     CCM: key(a*n+b, a<b) → {c: 条件件下标, g: g_wo}。只作用于 ic>0 的对。见 tools/build-cond.py。改总分。 */
  var CCM = null;
  /* 主题门控(2026-09-18, 只在另外载入 window.AD_MOE 时生效; 网站的"新版"标签用): 座位方向 x = 单位化(Σ 单位化嵌入),
     p = softmax(x·T/τ) 分到 K 个主题, 每件东西的单件分按主题加减 DW[件]·p。不载入时一个数都不变。 */
  var MOE = null;
  var EN = null, TQAX = null, TQMUAX, TQHMU, TQHSD, TQG = null;  // 队伍级配比项
  /* 份额层(2026-09-29): 每件 sb=刷钱上限, sd=吃资源斜率。每队 5 座位份额 = softmax(Σsb), 座位加 Σsd·(份额−0.2)·10。改总分。 */
  var SB = null, SD = null, SC = null, SCE = null, SCS = 0.7;
  /* 份额模式(09-29): expect=两队都按刷钱上限的期望份额(真人路人局口径, 默认);
     optimalL/optimalR/optimalBoth=该队按"自己人配合"分配: 真人梯队 34/26/19/13/8% 按需求(Σsd)分给五座位,
     约束: 一个座位的名次最多比它的刷钱上限名次高一位(刷不动的人当不了 1 号位)。 */
  var SHARE_MODE = (typeof window !== 'undefined' && window.AD_SHARE_MODE) || 'expect';
  var LADDER = [0.343, 0.255, 0.193, 0.132, 0.077];
  /* 09-29 分工模板(真人 120 万队份额聚类 K=5): 一超四酱 / 双核三酱 / 单核半吊 / 三核两酱 / 平均分; 团队模式在 模板×派法 里取最优 */
  var TPL = [[0.47,0.22,0.15,0.10,0.05],[0.38,0.31,0.16,0.10,0.05],[0.37,0.23,0.18,0.14,0.08],[0.33,0.28,0.23,0.11,0.05],[0.28,0.24,0.20,0.17,0.10]];
  var PERMS = (function () { var out = [], a = [0, 1, 2, 3, 4];
    (function rec(k) { if (k === 5) { out.push(a.slice()); return; } for (var i = k; i < 5; i++) { var t = a[k]; a[k] = a[i]; a[i] = t; rec(k + 1); t = a[k]; a[k] = a[i]; a[i] = t; } })(0); return out; })();
  /* 给 5 座位的 (Σsb, Σsd) 返回最优分配下每座位的份额 */
  function optimalShares(sbv, sdv) {
    var capRank = [0, 0, 0, 0, 0], q, r;
    for (q = 0; q < 5; q++) for (r = 0; r < 5; r++) if (sbv[r] > sbv[q] || (sbv[r] === sbv[q] && r < q)) capRank[q]++;
    var best = -1e300, bp = null;
    for (var i = 0; i < PERMS.length; i++) { var pm = PERMS[i], ok = true, v = 0;
      for (q = 0; q < 5; q++) { if (pm[q] < capRank[q] - 1) { ok = false; break; } v += sdv[q] * LADDER[pm[q]]; }
      if (ok && v > best) { best = v; bp = pm; } }
    var out = [0, 0, 0, 0, 0]; for (q = 0; q < 5; q++) out[q] = LADDER[bp[q]]; return { share: out, rank: bp };
  }
  function scBin(sh) { var b = 0; while (b < 9 && sh >= SCE[b + 1]) b++; return b; }
  /* 座位的曲线值(pp): 5 件在份额 sh 那一档的 真实−底座 之和 */
  function kitCurve(idxs, sh) { var b = scBin(sh), v = 0; for (var i = 0; i < idxs.length; i++) v += SC[idxs[i] * 10 + b]; return v; }
  /* 团队模式最优分配: 按曲线枚举 120 种, 约束名次≤上限名次+1 */
  /* 09-29 定稿(用户): 分配 = 开局给每人一个定位, 分到份额就是模板里那个位置的份额(不再乘刷钱能力)。
     刷钱能力只决定谁能领哪个位置: 定位名次最多比刷钱能力名次高一位。在 模板×派法 里取五套阵容曲线和最高的。 */
  function optimalByCurve(idxList, sbv) {
    var q, t, r, capRank = [0, 0, 0, 0, 0];
    for (q = 0; q < 5; q++) for (r = 0; r < 5; r++) if (sbv[r] > sbv[q] || (sbv[r] === sbv[q] && r < q)) capRank[q]++;
    var best = -1e300, bp = null, bt = 0, bs = null;
    for (t = 0; t < TPL.length; t++) { var L = TPL[t];
      for (var i = 0; i < PERMS.length; i++) { var pm = PERMS[i], w = [0, 0, 0, 0, 0], zs = 0, v = 0, ok = true;
        for (q = 0; q < 5; q++) if (pm[q] < capRank[q] - 1) { ok = false; break; } if (!ok) continue;
        for (q = 0; q < 5; q++) { w[q] = L[pm[q]]; v += kitCurve(idxList[q], w[q]); }
        if (v > best) { best = v; bp = pm; bt = t; bs = w; } } }
    return { rank: bp, tpl: bt, total: best, share: bs };
  }
  function optimalFor(t) { return SHARE_MODE === 'optimalBoth' || (t === 0 && SHARE_MODE === 'optimalL') || (t === 1 && SHARE_MODE === 'optimalR'); }

  /* 主题门控: 返回 {h: 座位修正合计, per: 每件修正, p: 各主题比例} */
  function themeOf(m) {
    var o = [], j; for (j = 0; j < m.p.length; j++) o.push(j);
    o.sort(function (a, b) { return m.p[b] - m.p[a]; });
    return { h: m.h, top: o.slice(0, 2).map(function (j) { return { name: MOE.labels[j] || ('主题' + j), p: m.p[j] }; }) };
  }
  function moeOf(arr) {
    var K_ = MOE.K, x = new Float64Array(K), i, k, j, n = 0;
    for (i = 0; i < arr.length; i++) for (k = 0; k < K; k++) x[k] += MOE.E[arr[i] * K + k];
    for (k = 0; k < K; k++) n += x[k] * x[k]; n = Math.sqrt(n);
    var p = new Float64Array(K_), mx = -1e300, z = 0;
    for (j = 0; j < K_; j++) { var a = 0; if (n > 1e-9) for (k = 0; k < K; k++) a += x[k] / n * MOE.T[j * K + k]; p[j] = a / MOE.tau; if (p[j] > mx) mx = p[j]; }
    for (j = 0; j < K_; j++) { p[j] = Math.exp(p[j] - mx); z += p[j]; }
    for (j = 0; j < K_; j++) p[j] /= z;
    var per = new Float64Array(arr.length), h = 0;
    for (i = 0; i < arr.length; i++) { var v = 0; for (j = 0; j < K_; j++) v += MOE.DW[arr[i] * K_ + j] * p[j]; per[i] = v; h += v; }
    return { h: h, per: per, p: p };
  }
  function b64f32(s) {
    var bin = atob(s), n = bin.length, b = new Uint8Array(n);
    for (var i = 0; i < n; i++) b[i] = bin.charCodeAt(i);
    return new Float32Array(b.buffer);
  }

  function init() {
    if (M) return true;
    if (!window.AD_MODEL) return false;
    M = window.AD_MODEL; K = M.K; K2 = M.K2 || 1; idx = M.index;
    W = b64f32(M.w);
    KS = M.ksplit == null ? K : M.ksplit;   // 前 KS 维配合加分,其余减分
    if (M.e) {                      // 普通 FM / 切半:只有一张嵌入表
      PLAIN = true; uA = uH = b64f32(M.e);
      cH = cA = new Float32Array(M.n * K2);
    } else {                        // 关系分型:本体×技能 和 技能×技能 用不同的表
      uA = b64f32(M.uA); uH = b64f32(M.uH); cH = b64f32(M.cH); cA = b64f32(M.cA);
    }
    /* 队伍构成项:按打钱分总和查 8 段分段线性 */
    if (M.fw) { FW = b64f32(M.fw); KNOT = b64f32(M.knot); TH = b64f32(M.th); }
    /* 跨队克制项:我方每件东西对敌方 NAX 条冻结轴的在意程度 */
    if (M.a) { AV = b64f32(M.a); SAX = b64f32(M.sax); AMU = b64f32(M.axmu);
               ASD = b64f32(M.axsd); NAX = M.nax; }
    /* 簇对项:座位内两两,按各自所属的簇查表。
       切半只能表达"同类扎堆亏"一个方向;实测按类型分 —— 堆治疗/远程核心/控制/物理被动
       是**赚**的(治疗×治疗 +0.054),只有堆力量近战身板才亏(−0.020)。这一项做逐类型修正。 */
    if (M.cp) { CL = M.cl; CP = b64f32(M.cp); NCL = M.ncl; }
    /* 归因数据:rg=每件东西的"泛用配合"强度 r,rmu=全局 μ,tp=紧耦合对的收缩系数 κ 与实测值。
       见 tools/build-attr.py。非 PLAIN 模型(本体/技能分表)不适用,直接不开。 */
    if (M.gk) { var gb = atob(M.gk), gn = gb.length; GK = new Uint8Array(gn); for (var q5 = 0; q5 < gn; q5++) GK[q5] = gb.charCodeAt(q5); }
    if (M.pfq) { var pb = atob(M.pfq), pn = pb.length, pbuf = new Uint8Array(pn); for (var q6 = 0; q6 < pn; q6++) pbuf[q6] = pb.charCodeAt(q6); PF = new Int16Array(pbuf.buffer); PFS = M.pfs || 1e-4; }
    if (window.AD_TRIO && window.AD_TRIO.trios) {
      TRP = new Map(); TRT = new Map();
      (window.AD_TRIO.pairs || []).forEach(function (r) { TRP.set(trioPairKey(idx[r[0]], idx[r[1]]), r[2]); });
      window.AD_TRIO.trios.forEach(function (r) { var a = idx[r[0]], b = idx[r[1]], c = idx[r[2]];
        if (a === undefined || b === undefined || c === undefined) throw new Error('三件修正表的技能不在模型里');
        if (!window.AD_TRIO.pairs) TRP.set(trioPairKey(a, b), r[3]); TRT.set(trioKey(a, b, c), r[4]); });
    }
    if (window.AD_MOE) {
      var AM = window.AD_MOE, mk = AM.K, mT = b64f32(AM.T), mD = b64f32(AM.DW), mE = new Float64Array(M.n * K);
      var eRaw = b64f32(M.e);
      for (var q9 = 0; q9 < M.n; q9++) { var nn9 = 0; for (var k9 = 0; k9 < K; k9++) nn9 += eRaw[q9 * K + k9] * eRaw[q9 * K + k9];
        nn9 = Math.sqrt(nn9); if (nn9 < 1e-9) nn9 = 1; for (k9 = 0; k9 < K; k9++) mE[q9 * K + k9] = eRaw[q9 * K + k9] / nn9; }
      MOE = { K: mk, T: mT, DW: mD, tau: AM.tau, E: mE, labels: AM.labels || [] };
    }
    if (M.cck && M.ccc && M.ccg) {
      var i32 = function (s0) { var bb = atob(s0), nb = bb.length, ub = new Uint8Array(nb); for (var q6 = 0; q6 < nb; q6++) ub[q6] = bb.charCodeAt(q6); return new Int32Array(ub.buffer); };
      var ck = i32(M.cck), cc = i32(M.ccc), cg = b64f32(M.ccg); CCM = new Map();
      for (var q7 = 0; q7 < ck.length; q7++) CCM.set(ck[q7], { c: cc[q7], g: cg[q7] });
    }
    if (M.sqk && M.sqv) {
      var sb = atob(M.sqk), sn = sb.length, sbuf = new Uint8Array(sn);
      for (var q3 = 0; q3 < sn; q3++) sbuf[q3] = sb.charCodeAt(q3);
      var sk = new Int32Array(sbuf.buffer), sv = b64f32(M.sqv); SQ = new Map();
      for (var q4 = 0; q4 < sk.length; q4++) SQ.set(sk[q4], { d: sv[q4 * 2], f: sv[q4 * 2 + 1] });
    }
    if (M.rg && PLAIN) {
      RG = b64f32(M.rg); RMU = M.rmu || 0; BREF = M.bref || 0.234;
      TP = new Map();
      if (M.tpk && M.tpv) {
        var kb = atob(M.tpk), kn = kb.length, kbuf = new Uint8Array(kn);
        for (var q = 0; q < kn; q++) kbuf[q] = kb.charCodeAt(q);
        var kk2 = new Int32Array(kbuf.buffer), vv2 = b64f32(M.tpv);
        for (var q2 = 0; q2 < kk2.length; q2++)
          TP.set(kk2[q2], { e: vv2[q2 * 2], n: vv2[q2 * 2 + 1] });
      }
    }
    /* 队伍级配比项:座位的 5 件求和后**单位化**(只留定位、不含强度),投到 8 条冻结轴上,
       全队 5 个座位相加,再过一个 36 项二次型。同轴扎堆 7/8 是负系数 ——
       "别在同一条轴上堆人";PC4(近战肉↔远程脆)罚得最狠,PC6(治疗)是唯一不罚的。 */
    if (M.sb && M.sd) { SB = b64f32(M.sb); SD = b64f32(M.sd); }
    if (M.sc) { SC = b64f32(M.sc); SCE = M.scedges; SCS = M.scscale == null ? 0.7 : M.scscale; }
    if (M.tqg) {
      TQAX = b64f32(M.tqax); TQMUAX = b64f32(M.tqmuax);
      TQHMU = b64f32(M.tqhmu); TQHSD = b64f32(M.tqhsd); TQG = b64f32(M.tqg);
      EN = new Float32Array(M.n * K);                 // 逐件单位化的嵌入(定位方向)
      for (var ii = 0; ii < M.n; ii++) {
        var off = ii * K, nn = 0, kk;
        for (kk = 0; kk < K; kk++) nn += uA[off + kk] * uA[off + kk];
        nn = Math.sqrt(nn); if (nn < 1e-9) nn = 1;
        for (kk = 0; kk < K; kk++) EN[off + kk] = uA[off + kk] / nn;
      }
    }
    return true;
  }

  /* 簇对系数:按 (簇a ≤ 簇b) 在上三角里的下标取值。和训练端 codes=[a*K+b for a in range(K) for b in range(a,K)] 一致 */
  function cpair(i, j) {
    if (!CP || i < 0 || j < 0) return 0;
    var a = CL[i], b = CL[j], t;
    if (a > b) { t = a; a = b; b = t; }
    return CP[a * NCL - a * (a - 1) / 2 + (b - a)];
  }

  /* 两两配合的原始分(和 evaluate 的切半口径一致) */
  function pairRaw(a, b) {
    var s2 = 0, t;
    for (t = 0; t < KS; t++) s2 += uA[a * K + t] * uA[b * K + t];
    for (t = KS; t < K; t++) s2 -= uA[a * K + t] * uA[b * K + t];
    return s2 + cpair(a, b);
  }
  function tpOf(a, b) { return TP ? (TP.get(a < b ? a * M.n + b : b * M.n + a) || null) : null; }
  function sqOf(a, b) { return SQ ? (SQ.get(a < b ? a * M.n + b : b * M.n + a) || null) : null; }
  function pfOf(a, b) { if (!PF || a === b || a < 0 || b < 0) return 0; if (a > b) { var t = a; a = b; b = t; }
    return PF[a * (2 * M.n - a - 1) / 2 + (b - a - 1)] * PFS; }
  function gOf(a, b) { if (!GK || a === b || a < 0 || b < 0) return 1; if (a > b) { var t = a; a = b; b = t; }
    return GK[a * (2 * M.n - a - 1) / 2 + (b - a - 1)] / 255; }
  /* 一对的最终配合分 = 真交互(扣泛用) + 压缩 → 正的再乘 g。返回 {v: 最终值, corr: 相对未收缩的差} */
  /* seat(可选):这对所在座位的全部下标;给了才做条件收缩 */
  function pairFinal(a, b, seat) {
    var base = pairRaw(a, b), sq = sqOf(a, b);
    var ic = (RG ? base - RMU - RG[a] - RG[b] : base) + (sq ? sq.d : 0);
    var g = ic > 0 ? gOf(a, b) : 1, cond = null;
    if (ic > 0 && CCM && seat) {
      var t = CCM.get(a < b ? a * M.n + b : b * M.n + a);
      if (t && seat.indexOf(t.c) < 0 && t.g < g) { g = t.g; cond = t.c; }
    }
    return { ic: ic, g: g, cond: cond, corr: (g - 1) * (ic > 0 ? ic : 0) };
  }

  /* 归因:μ+r_a+r_b 这部分跟"搭档是谁"无关(座位里逐项加起来就是每件各自的量),
     算成"单件"比算成"配合"诚实。返回 {shift 总量, per[] 每件分到多少},per 之和恒等于 shift。
     ⚠ 曾经还有一项"紧耦合对乘 κ 收缩",依据的边际残差对高共现的对有系统性低估,已撤。 */
  function attrOf(arr) {
    var m = arr.length, per = new Float64Array(m), shift = 0, i, j;
    if (!RG || m < 2) return { shift: 0, per: per };
    for (i = 0; i < m; i++) { var g = (m - 1) * (RG[arr[i]] + RMU / 2); per[i] += g; shift += g; }
    return { shift: shift, per: per };
  }

  /* 某个 key 在权重表里的下标;认不出来返回 -1(补位技能可能不在表里) */
  var _rev = null;
  function keyOfIdx(p) { if (!_rev) { _rev = []; for (var kk in idx) _rev[idx[kk]] = kk; } return _rev[p] || null; }
  function at(key) { var v = idx[key]; return v === undefined ? -1 : v; }

  /* 单个座位:返回 {w, fseat, sHH, sHA, sAH, sAA} */
  function seatOf(items) {
    var h = -1, ab = [], i, j, k;
    for (i = 0; i < items.length; i++) {
      var p = at(items[i]);
      if (p < 0) continue;
      if (String(items[i]).indexOf('hero:') === 0) { h = p; if (PLAIN) ab.push(p); }
      else ab.push(p);
    }
    var wsum = 0, fseat = 0;
    var aH = new Float64Array(K), SA = new Float64Array(K), sq = 0;
    if (!PLAIN && h >= 0) wsum += W[h];   // 普通 FM 下本体已在 ab 里,别重复加
    for (i = 0; i < ab.length; i++) {
      var o = ab[i] * K; wsum += W[ab[i]];
      for (k = 0; k < K; k++) { aH[k] += uH[o + k]; var v = uA[o + k]; SA[k] += v; sq += v * v; }
    }
    // 关系分型才有"本体 × 技能"这一项;普通 FM 里本体已经算进 ab 了,不能重复计
    if (!PLAIN && h >= 0) { var ho = h * K; for (k = 0; k < K; k++) fseat += uA[ho + k] * aH[k]; }
    /* 切半:前 KS 维加分、后 KS..K 维减分。
       普通 FM 的 e·eᵀ 必定半正定,说不出"同类扎堆反而亏";切半让它可以为负。
       KS===K 时下面这段退化回原来的 ½(‖Σe‖²−Σ‖e‖²)。 */
    var n2 = 0, sq2 = 0;
    for (k = 0; k < KS; k++) n2 += SA[k] * SA[k];
    for (k = KS; k < K; k++) n2 -= SA[k] * SA[k];
    for (i = 0; i < ab.length; i++) {
      var o2 = ab[i] * K;
      for (k = 0; k < KS; k++) { var v2 = uA[o2 + k]; sq2 += v2 * v2; }
      for (k = KS; k < K; k++) { var v3 = uA[o2 + k]; sq2 -= v3 * v3; }
    }
    fseat += .5 * (n2 - sq2);
    if (CP || SQ || GK || PF) {                // 簇对项 + 压缩项 + 小样本收缩 + 逐对修正:座位内 C(5,2)=10 对
      var all = ab; if (!PLAIN && h >= 0) { all = ab.slice(); all.push(h); }
      for (i = 0; i < all.length; i++) for (j = i + 1; j < all.length; j++) {
        fseat += cpair(all[i], all[j]);
        var sq0 = sqOf(all[i], all[j]); if (sq0) fseat += sq0.d;
        fseat += pfOf(all[i], all[j]);
        if (GK && RG) fseat += pairFinal(all[i], all[j], all).corr;
      }
    }
    if (TRP) { var ta = ab; if (!PLAIN && h >= 0) { ta = ab.slice(); ta.push(h); }
      for (i = 0; i < ta.length; i++) for (j = i + 1; j < ta.length; j++) {
        fseat += TRP.get(trioPairKey(ta[i], ta[j])) || 0;
        for (k = j + 1; k < ta.length; k++) fseat += TRT.get(trioKey(ta[i], ta[j], ta[k])) || 0;
      }
    }
    var sHH = new Float64Array(K2), sHA = new Float64Array(K2),
        sAH = new Float64Array(K2), sAA = new Float64Array(K2);
    if (!PLAIN && h >= 0) for (k = 0; k < K2; k++) { sHH[k] = cH[h*K2+k]; sHA[k] = cA[h*K2+k]; }
    if (!PLAIN) for (i = 0; i < ab.length; i++) {
      var q = ab[i] * K2;
      for (k = 0; k < K2; k++) { sAH[k] += cH[q + k]; sAA[k] += cA[q + k]; }
    }
    var tq = null;
    if (TQG) {
      var all2 = ab; if (!PLAIN && h >= 0) { all2 = ab.slice(); all2.push(h); }
      var u = new Float64Array(K), nu = 0;
      for (i = 0; i < all2.length; i++) { var o3 = all2[i] * K; for (k = 0; k < K; k++) u[k] += EN[o3 + k]; }
      for (k = 0; k < K; k++) nu += u[k] * u[k];
      nu = Math.sqrt(nu);
      tq = new Float64Array(8);
      if (nu > 1e-9) for (var q8 = 0; q8 < 8; q8++) {
        var acc8 = 0, ob = q8 * K;
        for (k = 0; k < K; k++) acc8 += u[k] * TQAX[ob + k];
        tq[q8] = (acc8 / nu - TQMUAX[q8] - TQHMU[q8]) / TQHSD[q8];
      }
    }
    var _all = ab; if (!PLAIN && h >= 0) { _all = ab.slice(); _all.push(h); }
    var _adj = attrOf(_all), _moe = null;
    if (MOE && _all.length) { _moe = moeOf(_all); wsum += _moe.h; }
    return { w: wsum, fseat: fseat, wAdj: wsum + _adj.shift, fAdj: fseat - _adj.shift, sHH: sHH, sHA: sHA, sAH: sAH, sAA: sAA, tq: tq, moe: _moe };
  }

  var dot = function (a, b) { var s = 0; for (var k = 0; k < a.length; k++) s += a[k] * b[k]; return s; };

  /* 09-29 英雄机制(用户裁定): 美杜莎座位上这几件按"空一个技能"算(不给分、不进配合)。与 server/mcts_fast.js HERO_DEAD 同源。 */
  var HERO_DEAD = { "hero:94": { primal_beast_uproar: 1, tidehunter_kraken_shell: 1, huskar_berserkers_blood: 1 } };
  var DEAD_ON = !(typeof window !== 'undefined' && window.AD_HERO_DEAD === 0);
  function deadFilterSeat(s) {
    if (!DEAD_ON || !s) return s; var d = null, j;
    for (j = 0; j < s.length; j++) if (HERO_DEAD[s[j]]) d = HERO_DEAD[s[j]];
    if (!d) return s; var f = []; for (j = 0; j < s.length; j++) if (!d[s[j]]) f.push(s[j]); return f.length === s.length ? s : f;
  }
  function deadFilter(seats) { var out = null; for (var i = 0; i < seats.length; i++) { var f = deadFilterSeat(seats[i]); if (f !== seats[i]) { if (!out) out = seats.slice(); out[i] = f; } } return out || seats; }
  /* seats: 10 × 5 的 key 数组。返回 {logit, prob, seatScore[10], teamScore[2]} */
  function evaluate(seats) {
    if (!init()) return null;
    var rawSeats = seats;
    seats = deadFilter(seats);
    var S = [], t, k, i;
    for (i = 0; i < 10; i++) S.push(seatOf(seats[i] || []));
    var T = [];                                   // 每队的跨座位累加量
    for (t = 0; t < 2; t++) {
      var THH = new Float64Array(K2), THA = new Float64Array(K2),
          TAH = new Float64Array(K2), TAA = new Float64Array(K2);
      for (i = t * 5; i < t * 5 + 5; i++)
        for (k = 0; k < K2; k++) {
          THH[k] += S[i].sHH[k]; THA[k] += S[i].sHA[k];
          TAH[k] += S[i].sAH[k]; TAA[k] += S[i].sAA[k];
        }
      T.push({ THH: THH, THA: THA, TAH: TAH, TAA: TAA });
    }
    var z = 0, seatScore = [], teamScore = [0, 0];
    for (i = 0; i < 10; i++) {
      t = i < 5 ? 0 : 1;
      var s = S[i], Tt = T[t];
      var cross = .1 * (dot(Tt.THH, Tt.THH) + dot(Tt.TAA, Tt.TAA))
                + .2 * dot(Tt.THA, Tt.TAH)
                - .5 * (dot(s.sHH, s.sHH) + dot(s.sAA, s.sAA))
                - dot(s.sHA, s.sAH);
      var v = s.w + s.fseat + cross;
      seatScore.push({ main: s.w, syn: s.fseat, main2: s.wAdj, syn2: s.fAdj, cross: cross, ctr: 0, total: v, theme: s.moe ? themeOf(s.moe) : null });
      teamScore[t] += v;
      z += (t === 0 ? 1 : -1) * v;
    }
    /* ①b 份额层(09-29):每队 5 座位按 Σsb 做 softmax 得预测补刀份额, 座位加 Σsd·(份额−0.2)·10 */
    var shL = 0, shR = 0;
    if (SB) {
      for (t = 0; t < 2; t++) {
        var sbv = [0, 0, 0, 0, 0], sdv = [0, 0, 0, 0, 0], mx = -1e300, zs = 0, q;
        for (q = 0; q < 5; q++) { var kq = seats[t * 5 + q] || [];
          for (var z5 = 0; z5 < kq.length; z5++) { var pq = at(kq[z5]); if (pq >= 0) { sbv[q] += SB[pq]; sdv[q] += SD[pq]; } }
          if (sbv[q] > mx) mx = sbv[q]; }
        var ex = [0, 0, 0, 0, 0]; for (q = 0; q < 5; q++) { ex[q] = Math.exp(sbv[q] - mx); zs += ex[q]; }
        var shArr = ex.map(function (v) { return v / zs; }), rkArr = null, idxList = null;
        var tplArr = null;
        if (optimalFor(t) && SC) { idxList = []; for (q = 0; q < 5; q++) { var kq2 = seats[t * 5 + q] || [], li = []; for (var z6 = 0; z6 < kq2.length; z6++) { var p6 = at(kq2[z6]); if (p6 >= 0) li.push(p6); } idxList.push(li); }
          var ob = optimalByCurve(idxList, sbv); rkArr = ob.rank; tplArr = TPL[ob.tpl]; var optSh = ob.share; }
        var useOpt = false;
        if (rkArr) { var totOpt = 0, totNat = 0; for (q = 0; q < 5; q++) { totOpt += kitCurve(idxList[q], optSh[q]); totNat += kitCurve(idxList[q], shArr[q]); } useOpt = totOpt > totNat; }   /* 09-29: 最优梯队不高于自然分配就不动(超级大核+四酱油不扣) */
        for (q = 0; q < 5; q++) { var shq = shArr[q], vq = sdv[q] * (shq - 0.2) * 10, pos = null;
          /* 期望份额下的残差项(裁判口径) + 团队模式下"分到的位置 vs 平时"的曲线差值 */
          if (rkArr) { var asg = optSh[q]; pos = useOpt ? (kitCurve(idxList[q], asg) - kitCurve(idxList[q], shq)) * SCS / 25 : 0; vq += pos; seatScore[t * 5 + q].optShare = asg; seatScore[t * 5 + q].roleShare = tplArr[rkArr[q]]; }
          seatScore[t * 5 + q].share = vq; seatScore[t * 5 + q].shareP = shq; seatScore[t * 5 + q].shareRank = rkArr ? rkArr[q] + 1 : null; seatScore[t * 5 + q].posTerm = pos;
          seatScore[t * 5 + q].sumB = sbv[q]; seatScore[t * 5 + q].sumD = sdv[q]; seatScore[t * 5 + q].total += vq;
          teamScore[t] += vq; if (t === 0) shL += vq; else shR += vq; }
      }
      z += shL - shR;
    }
    /* ② 队伍构成项:各队打钱分总和 → 8 段分段线性,左减右 */
    var comp = 0, compL = 0, compR = 0, ctrL = 0, ctrR = 0;
    if (FW) {
      var fs = [0, 0];
      for (i = 0; i < 10; i++) {
        var kk = seats[i] || [];
        for (var z2 = 0; z2 < kk.length; z2++) { var pz = at(kk[z2]); if (pz >= 0) fs[i < 5 ? 0 : 1] += FW[pz]; }
      }
      var seg = function (v) {
        var B = KNOT.length - 1, j = 0;
        while (j < B - 1 && v >= KNOT[j + 1]) j++;
        var fr = (v - KNOT[j]) / (KNOT[j + 1] - KNOT[j]);
        fr = fr < 0 ? 0 : fr > 1 ? 1 : fr;
        return TH[j] * (1 - fr) + TH[j + 1] * fr;
      };
      compL = seg(fs[0]); compR = seg(fs[1]);
      comp = compL - compR; z += comp;
      teamScore[0] += compL; teamScore[1] += compR;   // 归到各自那一边,总分才和胜率同源
    }
    /* ③ 跨队克制:⟨Σ我方 a, 敌方轴坐标⟩ − 对称项。写成差的形式,反对称由结构保证 */
    if (AV) {
      var uu = [new Float64Array(NAX), new Float64Array(NAX)];   // 两队的轴坐标
      var aa = [new Float64Array(NAX), new Float64Array(NAX)];   // 两队的克制向量和
      for (i = 0; i < 10; i++) {
        var t2 = i < 5 ? 0 : 1, ks2 = seats[i] || [];
        for (var z3 = 0; z3 < ks2.length; z3++) {
          var pp = at(ks2[z3]); if (pp < 0) continue;
          for (k = 0; k < NAX; k++) { uu[t2][k] += SAX[pp * NAX + k]; aa[t2][k] += AV[pp * NAX + k]; }
        }
      }
      for (t = 0; t < 2; t++) for (k = 0; k < NAX; k++) uu[t][k] = (uu[t][k] - AMU[k]) / ASD[k];
      /* 克制项对每件东西是线性的,所以能精确拆到座位:
         这个座位的克制贡献 = Σ_{件∈座位} ⟨a_件, 敌方轴坐标⟩ */
      for (i = 0; i < 10; i++) {
        var tt = i < 5 ? 0 : 1, kk3 = seats[i] || [], sc3 = 0;
        for (var z4 = 0; z4 < kk3.length; z4++) {
          var p3 = at(kk3[z4]); if (p3 < 0) continue;
          for (k = 0; k < NAX; k++) sc3 += AV[p3 * NAX + k] * uu[1 - tt][k];
        }
        seatScore[i].ctr = sc3;
        seatScore[i].total += sc3;          // 计进座位总分,座位分加起来才等于队伍分
        if (tt === 0) ctrL += sc3; else ctrR += sc3;
      }
      ctr = ctrL - ctrR; z += ctr;
      teamScore[0] += ctrL; teamScore[1] += ctrR;
    }
    /* ⑤ 队伍级配比项:两队各自 5 个座位的 8 轴坐标求和 → 36 项二次型,左减右 */
    var tq = 0, tqL = 0, tqR = 0;
    if (TQG) {
      var TC = [new Float64Array(8), new Float64Array(8)];
      for (i = 0; i < 10; i++) {
        var tqi = S[i].tq; if (!tqi) continue;
        for (k = 0; k < 8; k++) TC[i < 5 ? 0 : 1][k] += tqi[k];
      }
      var c8 = 0;
      for (var a8 = 0; a8 < 8; a8++) for (var b8 = a8; b8 < 8; b8++) {
        tqL += TQG[c8] * TC[0][a8] * TC[0][b8];
        tqR += TQG[c8] * TC[1][a8] * TC[1][b8];
        c8++;
      }
      tq = tqL - tqR; z += tq;
      teamScore[0] += tqL; teamScore[1] += tqR;
    }
    // Alchemist depends on the four teammates' actual occupied slots.
    var al = window.AD_TRIO && window.AD_TRIO.alchemist;
    if (al) for (i = 0; i < 10; i++) {
      if (!(rawSeats[i] || []).some(function (key) { return idx[key] === al.index; })) continue;
      var count = 0, people = 0, ready = true;
      for (var j = Math.floor(i / 5) * 5; j < Math.floor(i / 5) * 5 + 5; j++) if (j !== i) {
        var raw = (rawSeats[j] || []).filter(function (key) { return idx[key] !== undefined; });
        if (raw.length !== 5) ready = false;
        var sc = raw.reduce(function (v, key) { return v + (al.eligible[idx[key]] || 0); }, 0);
        count += sc; if (sc > 0) people++;
      }
      var bias = ready ? al.bias[Math.min(16, count)][people] : 0;
      seatScore[i].alchemist = bias; seatScore[i].cross += bias; seatScore[i].total += bias;
      teamScore[i < 5 ? 0 : 1] += bias; z += (i < 5 ? 1 : -1) * bias;
    }
    return { logit: z, prob: 1 / (1 + Math.exp(-z)), seats: seatScore, team: teamScore,
             comp: comp, ctr: ctr, compL: compL, compR: compR, ctrL: ctrL, ctrR: ctrR,
             tq: tq, tqL: tqL, tqR: tqR, share: shL - shR, shareL: shL, shareR: shR };
  }

  /* 给某个座位挑候选:返回每个候选带来的 Δlogit(对该座位所属方为正=更好)。
     同一个模型顺手就是选技推荐 / AI 对手。 */
  function rank(seats, seatIdx, candidates) {
    if (!init()) return [];
    var sign = seatIdx < 5 ? 1 : -1;
    var base = evaluate(seats);
    if (!base) return [];
    var out = [];
    for (var i = 0; i < candidates.length; i++) {
      var cp = seats.map(function (x) { return x.slice(); });
      cp[seatIdx] = cp[seatIdx].concat([candidates[i]]);
      var r = evaluate(cp);
      out.push({ key: candidates[i], delta: sign * (r.logit - base.logit) });
    }
    out.sort(function (a, b) { return b.delta - a.delta; });
    return out;
  }

  /* 拆解一个座位:5 件东西的单件强度 + C(5,2)=10 对两两配合,逐条列出。
     面板上那个座位总分就是这些数加起来的,点开能自己核对。 */
  function explain(items) {
    if (!init()) return null;
    items = deadFilterSeat(items);
    var ks = [], i, j;
    for (i = 0; i < items.length; i++) if (at(items[i]) >= 0) ks.push(items[i]);
    var main = ks.map(function (k) { return { key: k, w: W[at(k)] }; });
    var pairs = [], seatIdx = ks.map(at);
    for (i = 0; i < ks.length; i++) for (j = i + 1; j < ks.length; j++) {
      var a = at(ks[i]), b = at(ks[j]), s = 0;
      /* 必须和 evaluate 里的切半口径一致:前 KS 维加分、后面减分。
         之前这里是 96 维全加,拆解面板的配合值比座位卡片大了几倍。 */
      for (var t = 0; t < KS; t++) s += uA[a * K + t] * uA[b * K + t];
      for (var t3 = KS; t3 < K; t3++) s -= uA[a * K + t3] * uA[b * K + t3];
      if (!PLAIN && (String(ks[i]).indexOf('hero:') === 0 || String(ks[j]).indexOf('hero:') === 0)) {
        var hh = String(ks[i]).indexOf('hero:') === 0 ? a : b;
        var aa = hh === a ? b : a; s = 0;
        for (var t2 = 0; t2 < K; t2++) s += uA[hh * K + t2] * uH[aa * K + t2];
      }
      var tp = tpOf(a, b), sq = sqOf(a, b);
      var pf = (GK && RG) ? pairFinal(a, b, seatIdx) : null;
      var fx = pfOf(a, b), trp = TRP ? (TRP.get(trioPairKey(a, b)) || 0) : 0;
      var vv = s + cpair(a, b) + (sq ? sq.d : 0) + (pf ? pf.corr : 0) + fx + trp;
      /* v2 = 归因修正后的"真配合":扣掉泛用强度 μ+r_a+r_b。扣掉的不会消失,已折进左边单件栏。 */
      var v2 = RG ? (vv - RMU - RG[a] - RG[b]) : vv;
      pairs.push({ a: ks[i], b: ks[j], v: vv, v2: v2, f: sq ? sq.f : null, raw2: sq ? v2 - sq.d - (pf ? pf.corr : 0) - fx - trp : null, fix: fx, trioPair: trp,
                   g: (pf && pf.g < 0.999) ? pf.g : null, pre_g: pf ? v2 - pf.corr : null, cond: (pf && pf.cond != null) ? keyOfIdx(pf.cond) : null,
                   emp: tp ? tp.e : null, n: tp ? tp.n : 0,
                   pred: v2 * BREF });          // 模型预示的胜率增量,和 emp 同口径
    }
    pairs.sort(function (x, y) { return y.v2 - x.v2; });
    var idxs = ks.map(at), adj = attrOf(idxs), mo = (MOE && idxs.length) ? moeOf(idxs) : null;
    main.forEach(function (mm, t) { if (mo) { mm.moe = mo.per[t]; mm.w += mo.per[t]; } mm.w2 = mm.w + adj.per[t]; });
    var ms = main.reduce(function (p, c) { return p + c.w; }, 0);
    var ps = pairs.reduce(function (p, c) { return p + c.v; }, 0);
    var ms2 = main.reduce(function (p, c) { return p + c.w2; }, 0);
    var ps2 = pairs.reduce(function (p, c) { return p + c.v2; }, 0);
    var triples = [], ts = 0;
    if (TRT) for (i = 0; i < ks.length; i++) for (j = i + 1; j < ks.length; j++) for (var q = j + 1; q < ks.length; q++) {
      var tv = TRT.get(trioKey(seatIdx[i], seatIdx[j], seatIdx[q])) || 0;
      if (tv) { triples.push({ a: ks[i], b: ks[j], c: ks[q], v: tv }); ts += tv; }
    }
    return { main: main, pairs: pairs, triples: triples, tripleSum: ts, mainSum: ms, pairSum: ps,
             mainSum2: ms2, pairSum2: ps2, bref: BREF, total: ms + ps + ts, theme: mo ? themeOf(mo) : null };
  }

  function setShareMode(m) { SHARE_MODE = m || 'expect'; }
  return { evaluate: evaluate, rank: rank, explain: explain, ready: init, setShareMode: setShareMode, getShareMode: function () { return SHARE_MODE; }, optimalShares: optimalShares, optimalByCurve: function (seatsKeys, sbv) { var il = seatsKeys.map(function (ks) { var li = []; for (var i = 0; i < ks.length; i++) { var p = at(ks[i]); if (p >= 0) li.push(p); } return li; }); return optimalByCurve(il, sbv); }, TPL: TPL, HERO_DEAD: HERO_DEAD, isDead: function (seatKeys, key) { var s = deadFilterSeat(seatKeys.concat([key])); return s.indexOf(key) < 0; }, shareItem: function (key) { var p = at(key); if (p < 0 || !SC) return null; var c = []; for (var b = 0; b < 10; b++) c.push(SC[p * 10 + b]); return { sb: SB[p], sd: SD[p], curve: c, edges: SCE }; }, kitCurve: function (keys, sh) { if (!SC) return null; var li = []; for (var i = 0; i < keys.length; i++) { var p = at(keys[i]); if (p >= 0) li.push(p); } return kitCurve(li, sh); } };
})();
