# SvgEditor Local Copy

这个目录由 `scripts/exportReactComponent.mjs` 自动生成，可直接复制到其他 React 项目中使用。

## 目录说明

- `app/`
- `components/`
- `kernel/`
- `layers/`
- `rendering/`
- `App.css`
- `index.css`
- `SvgEditor.tsx`
- `index.ts`

## 使用方式

在目标项目中引入：

```tsx
import { SvgEditor } from "./exported-react-component";

export default function Page() {
  return <SvgEditor style={{ width: "100%", height: "100vh" }} />;
}
```

## 依赖

目标 React 项目需要安装：

```bash
npm install fabric react-colorful
```

如果是 Next.js / SSR 项目，请改为客户端动态加载，避免在服务端直接执行。
