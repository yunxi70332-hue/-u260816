import { FormEvent, useEffect, useState } from "react";
import App from "./App";

type PortalPayload = { portal: { slug: string; enabled: boolean; visibleModules: string[] }; authenticated: boolean; customer: { id: string; email: string } | null; template: { id: string; name: string; configSnapshot: unknown } | null };
const moduleLabels: Record<string, string> = { "single-cell": "基础一格", shelf: "层板", drawer: "抽屉", door: "门板", glass: "玻璃模块" };

async function call<T>(url: string, body?: unknown): Promise<T> {
  const response = await fetch(url, { method: body === undefined ? "GET" : "POST", credentials: "include", headers: body === undefined ? undefined : { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload?.error?.message || "请求失败");
  return payload as T;
}

export default function PortalApp({ slug }: { slug: string }) {
  const [portal, setPortal] = useState<PortalPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"login" | "signup">("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [supportCode, setSupportCode] = useState("");

  async function refresh() {
    try { setPortal(await call<PortalPayload>(`/api/portal/${encodeURIComponent(slug)}`)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "门户暂不可用"); }
  }
  useEffect(() => { void refresh(); }, [slug]);
  async function submit(event: FormEvent) {
    event.preventDefault(); setError(null);
    try {
      await call(`/api/portal/${encodeURIComponent(slug)}/${mode}`, mode === "signup" ? { email, password, supportCode } : { email, password });
      await refresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "认证失败"); }
  }
  if (portal?.authenticated) return <App />;
  return <main style={{ minHeight: "100vh", background: "#f4f5f3", color: "#1f2925", padding: "48px 24px", fontFamily: "system-ui, sans-serif" }}>
    <section style={{ maxWidth: 920, margin: "0 auto", display: "grid", gridTemplateColumns: "1.2fr .8fr", gap: 28, alignItems: "start" }}>
      <div><p style={{ letterSpacing: 1, fontSize: 12, color: "#6b766f" }}>企业模块化配置门户</p><h1 style={{ fontSize: 40, margin: "10px 0" }}>{portal?.template?.name || "基础一格模块"}</h1><p style={{ color: "#5d6861", lineHeight: 1.7 }}>访客可先查看基础一格方案。注册后可以继续添加模块、保存模型并提交咨询。</p><div style={{ marginTop: 28, border: "1px solid #d6dbd7", background: "#fff", padding: 24, minHeight: 260 }}><strong>基础一格</strong><div style={{ marginTop: 24, width: 180, height: 180, border: "10px solid #3e4742", background: "#d9dfda", display: "grid", placeItems: "center", color: "#5e6b63" }}>基础模块</div></div><div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 18 }}>{(portal?.portal.visibleModules || ["single-cell"]).map((item) => <span key={item} style={{ border: "1px solid #c7cfca", padding: "5px 9px", fontSize: 12 }}>{moduleLabels[item] || item}{item !== "single-cell" ? " · 注册后" : ""}</span>)}</div></div>
      <form onSubmit={submit} style={{ background: "#fff", border: "1px solid #d6dbd7", padding: 24, display: "grid", gap: 12 }}><h2 style={{ margin: 0 }}>{mode === "signup" ? "注册客户账号" : "客户登录"}</h2><p style={{ margin: 0, color: "#6b766f", fontSize: 13 }}>{mode === "signup" ? "注册后解锁更多作图模块和保存功能" : "登录后继续编辑模型"}</p><input value={email} onChange={(event) => setEmail(event.target.value)} type="email" placeholder="邮箱" required style={{ padding: 11, border: "1px solid #ccd3ce" }} /><input value={password} onChange={(event) => setPassword(event.target.value)} type="password" placeholder="密码（至少6位）" minLength={6} required style={{ padding: 11, border: "1px solid #ccd3ce" }} />{mode === "signup" && <input value={supportCode} onChange={(event) => setSupportCode(event.target.value)} placeholder="企业客服验证码" required style={{ padding: 11, border: "1px solid #ccd3ce" }} />}{error && <div style={{ color: "#b42318", fontSize: 13 }}>{error}</div>}<button type="submit" style={{ padding: 11, border: 0, background: "#26332d", color: "white", cursor: "pointer" }}>{mode === "signup" ? "注册并开始" : "登录并继续"}</button><button type="button" onClick={() => setMode(mode === "signup" ? "login" : "signup")} style={{ border: 0, background: "transparent", color: "#46574d", cursor: "pointer" }}>{mode === "signup" ? "已有账号，去登录" : "没有账号，去注册"}</button></form>
    </section>
  </main>;
}
