"use strict";
/* DirectML计算线程与主进程共用PID。1.47.5撤销调度提升后，同一设备更新前后
   预热15ms→114ms；调度竞争是性能回归嫌疑，真机A/B仍需验证。
   默认请求较高(3)，读回实际档位与API返回码；normal实验请求普通(2)。
   档位:0空闲/1较低/2普通/3较高/4高/5实时。只在启动时执行一次。 */
const NAMES = ["空闲", "较低", "普通", "较高", "高", "实时"];
function configure(pid, log, done, options = {}) {
  if (process.platform !== "win32") return done && done(null);
  const target = options.target === 2 ? 2 : 3;
  const ps = `$ErrorActionPreference='Stop'
Add-Type -TypeDefinition 'using System;using System.Runtime.InteropServices;public static class GP{[DllImport("gdi32.dll")]public static extern int D3DKMTSetProcessSchedulingPriorityClass(IntPtr h,int c);[DllImport("gdi32.dll")]public static extern int D3DKMTGetProcessSchedulingPriorityClass(IntPtr h,out int c);}'
$h=[System.Diagnostics.Process]::GetProcessById(${pid | 0}).Handle
$o=0;$r=[GP]::D3DKMTGetProcessSchedulingPriorityClass($h,[ref]$o);"before $o status "+('{0:X8}' -f $r)
if($r -eq 0 -and $o -ne ${target}){$r=[GP]::D3DKMTSetProcessSchedulingPriorityClass($h,${target});"set ${target} status "+('{0:X8}' -f $r)}
$o=0;$r=[GP]::D3DKMTGetProcessSchedulingPriorityClass($h,[ref]$o);"after $o status "+('{0:X8}' -f $r)`;
  require("child_process").execFile("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", ps], { timeout: 10000, windowsHide: true }, (err, out) => {
    const s = String(out || ""), before = /before (\d) status ([0-9A-F]{8})/i.exec(s),
      after = /after (\d) status ([0-9A-F]{8})/i.exec(s), set = /set (\d) status ([0-9A-F]{8})/i.exec(s);
    const valid = match => match && match[2] === "00000000" && +match[1] < NAMES.length;
    const level = valid(after) ? +after[1] : null, previous = valid(before) ? +before[1] : null;
    const result = { level, name: level === null ? "未知" : NAMES[level], previous, target,
      verified: !err && level !== null, applied: !err && level === target,
      setStatus: set ? set[2] : null, readStatus: after ? after[2] : null };
    log("gpu", `显卡调度优先级: ${previous === null ? "未知" : NAMES[previous]} → ${result.name}，目标${NAMES[target]}，读回=${result.readStatus || "缺失"} 设置=${result.setStatus || "未设置"}${err ? " 错误=" + String(err.message || err).slice(0, 160) : ""}`);
    if (done) done(result);
  });
}
module.exports = { configure, raise: configure, NAMES };
