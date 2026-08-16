import { ArrowLeft, FileQuestion } from "lucide-react";
import { Link } from "react-router-dom";

export function NotFoundPage() {
  return <main className="not-found"><FileQuestion size={34} /><h1>页面不存在</h1><p>该地址可能已变更，或你没有查看权限。</p><Link className="button primary" to="/"><ArrowLeft size={16} />返回仪表盘</Link></main>;
}
