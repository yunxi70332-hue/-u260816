import { Alert, Button, Form, Input } from "antd";
import { ArrowRight, Database, LockKeyhole, ShieldCheck, UserRound } from "lucide-react";
import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/auth";

interface LoginFormValues {
  account: string;
  password: string;
}

export function LoginPage() {
  const { session, login, enterDemo, loginError } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!session) return;
    const returnTo = session.mode === "live" ? getSafeReturnTo(location.search) : null;
    if (returnTo) {
      window.location.replace(returnTo);
      return;
    }
    navigate("/", { replace: true });
  }, [location.search, navigate, session]);

  async function submit(values: LoginFormValues) {
    setSubmitting(true);
    try {
      await login(values.account, values.password);
    } catch {
      // The auth provider exposes a user-facing error message.
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="login-page">
      <section className="login-brand-panel">
        <div className="login-brand">
          <div className="brand-mark large"><span /><span /><span /><span /></div>
          <div><strong>USM</strong><span>运营中心</span></div>
        </div>
        <div className="login-statement">
          <p className="eyebrow">从方案到交付</p>
          <h1>让每一份配置，都成为可追踪的订单。</h1>
          <p>统一管理客户项目、配置版本、报价审批、生产履约与渠道价格。</p>
        </div>
        <div className="login-proof">
          <div><ShieldCheck size={18} /><span><strong>组织隔离</strong><small>按租户与角色控制数据边界</small></span></div>
          <div><Database size={18} /><span><strong>版本留痕</strong><small>设计、价格与订单快照可审计</small></span></div>
        </div>
      </section>
      <section className="login-form-panel">
        <div className="login-form-wrap">
          <div className="login-heading"><span>内部系统</span><h2>登录运营中心</h2><p>使用公司账号进入所属工作区。</p></div>
          <Form<LoginFormValues> layout="vertical" requiredMark={false} onFinish={(values) => void submit(values)} className="login-form">
            <Form.Item label="手机号" name="account" rules={[{ required: true, message: "请输入登录手机号" }]}>
              <Input size="large" prefix={<UserRound size={17} />} placeholder="输入登录手机号" autoComplete="tel" inputMode="tel" />
            </Form.Item>
            <Form.Item label="密码" name="password" rules={[{ required: true, message: "请输入密码" }]}>
              <Input.Password size="large" prefix={<LockKeyhole size={17} />} placeholder="输入密码" autoComplete="current-password" />
            </Form.Item>
            {loginError && <Alert type="error" showIcon message={loginError} role="alert" />}
            <Button type="primary" htmlType="submit" size="large" block loading={submitting} iconPosition="end" icon={<ArrowRight size={17} />}>登录</Button>
          </Form>
          <div className="login-divider"><span>或</span></div>
          <Button size="large" block icon={<Database size={17} />} onClick={enterDemo}>进入演示工作区</Button>
          <p className="login-footnote">演示模式使用浏览器内置数据，不需要启动 API 服务。</p>
        </div>
        <footer>USM Configurator · ERP Console 0.1</footer>
      </section>
    </main>
  );
}

function getSafeReturnTo(search: string) {
  const value = new URLSearchParams(search).get("returnTo");
  if (!value) return null;
  try {
    const target = new URL(value, window.location.origin);
    return target.origin === window.location.origin ? target.href : null;
  } catch {
    return null;
  }
}
