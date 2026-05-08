# Editor Export Scripts

这个目录放的是“把当前编辑器源码导出到其他 React 项目”的辅助脚本。

## 推荐脚本

在项目根目录执行：

```bash
npm run export:react-component -- /绝对路径/到/目标项目/src/modules/svg-editor
```

或者直接执行：

```bash
node scripts/exportReactComponent.mjs /绝对路径/到/目标项目/src/modules/svg-editor
```

如果不传目标目录，默认导出到：

```text
exported-react-component
```

## 脚本会做什么

- 复制 `EditorShell` 相关本地依赖源码
- 保持原有相对 import 路径可用
- 生成 `SvgEditor.tsx` 包装组件
- 生成 `index.ts` 导出入口
- 生成目标目录 `README.md`

## 导出后的目录

导出结果可直接放进目标 React 项目，例如：

```text
src/
  modules/
    svg-editor/
      app/
      components/
      kernel/
      layers/
      rendering/
      App.css
      index.css
      SvgEditor.tsx
      index.ts
```

## 目标项目使用方式

```tsx
import { SvgEditor } from "@/modules/svg-editor";

export default function Page() {
  return <SvgEditor style={{ width: "100%", height: "100vh" }} />;
}
```

## 目标项目依赖

目标 React 项目需要安装：

```bash
npm install fabric react-colorful
```

如果目标项目是 Next.js 或其他 SSR 框架，请改成客户端动态加载，不要在服务端直接渲染该组件。
