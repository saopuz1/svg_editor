import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PROJECT_ROOT = path.resolve(__dirname, "..");
const SRC_ROOT = path.join(PROJECT_ROOT, "src");
const DEFAULT_TARGET_DIR = path.join(PROJECT_ROOT, "exported-react-component");

const ENTRY_FILES = [
  path.join(SRC_ROOT, "app", "EditorContext.tsx"),
  path.join(SRC_ROOT, "layers", "view", "EditorShell.tsx"),
  path.join(SRC_ROOT, "App.css"),
  path.join(SRC_ROOT, "index.css"),
];

const TEXT_EXTS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".css",
  ".json",
  ".svg",
]);

const PACKAGE_DEPENDENCIES = ["fabric", "react-colorful"];

const IMPORT_RE =
  /(?:import|export)\s+(?:type\s+)?(?:[\s\S]*?\s+from\s+)?["']([^"']+)["']\s*;?/g;

function resolveTargetDir(rawTargetDir) {
  if (!rawTargetDir) return DEFAULT_TARGET_DIR;
  return path.isAbsolute(rawTargetDir)
    ? rawTargetDir
    : path.resolve(process.cwd(), rawTargetDir);
}

function isUnder(dir, file) {
  const rel = path.relative(dir, file);
  return !!rel && !rel.startsWith("..") && !path.isAbsolute(rel);
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function readText(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function writeText(filePath, content) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, content, "utf8");
}

function resolveImport(fromFile, spec) {
  if (!spec.startsWith(".")) return null;

  const base = path.resolve(path.dirname(fromFile), spec);
  const tryFiles = [];

  if (path.extname(base)) {
    tryFiles.push(base);
  } else {
    tryFiles.push(`${base}.ts`);
    tryFiles.push(`${base}.tsx`);
    tryFiles.push(`${base}.js`);
    tryFiles.push(`${base}.jsx`);
    tryFiles.push(`${base}.mjs`);
    tryFiles.push(`${base}.cjs`);
    tryFiles.push(`${base}.json`);
    tryFiles.push(`${base}.css`);
    tryFiles.push(path.join(base, "index.ts"));
    tryFiles.push(path.join(base, "index.tsx"));
    tryFiles.push(path.join(base, "index.js"));
    tryFiles.push(path.join(base, "index.jsx"));
  }

  for (const candidate of tryFiles) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return candidate;
    }
  }

  return null;
}

function collectDeps(entryFiles) {
  const queue = [...entryFiles];
  const seen = new Set();
  const result = [];
  const unresolvedLocalImports = [];

  while (queue.length) {
    const file = queue.pop();
    if (!file) continue;
    const real = fs.existsSync(file) ? fs.realpathSync(file) : file;
    if (seen.has(real)) continue;
    seen.add(real);

    if (!fs.existsSync(real) || !fs.statSync(real).isFile()) continue;
    if (!isUnder(SRC_ROOT, real)) continue;

    result.push(real);

    const ext = path.extname(real);
    if (!TEXT_EXTS.has(ext)) continue;

    const content = readText(real);
    IMPORT_RE.lastIndex = 0;
    let match;
    while ((match = IMPORT_RE.exec(content))) {
      const spec = match[1];
      if (!spec.startsWith(".")) continue;
      const resolved = resolveImport(real, spec);
      if (!resolved) {
        unresolvedLocalImports.push({
          from: path.relative(PROJECT_ROOT, real),
          spec,
        });
        continue;
      }
      queue.push(resolved);
    }
  }

  result.sort();
  return { files: result, unresolvedLocalImports };
}

function copyToTarget(srcFile, targetDir) {
  const relFromSrcRoot = path.relative(SRC_ROOT, srcFile);
  const targetFile = path.join(targetDir, relFromSrcRoot);
  ensureDir(path.dirname(targetFile));
  fs.copyFileSync(srcFile, targetFile);
  return targetFile;
}

function createWrapperComponent() {
  return `import type { CSSProperties } from "react";
import { EditorProvider } from "./app/EditorContext";
import { EditorShell } from "./layers/view/EditorShell";
import "./index.css";
import "./App.css";

export interface SvgEditorProps {
  className?: string;
  style?: CSSProperties;
}

export function SvgEditor({ className, style }: SvgEditorProps) {
  return (
    <div className={className} style={style}>
      <EditorProvider>
        <EditorShell />
      </EditorProvider>
    </div>
  );
}
`;
}

function createIndexFile() {
  return `export { SvgEditor } from "./SvgEditor";
export type { SvgEditorProps } from "./SvgEditor";
export { buildExportSvg } from "./layers/view/FabricStage";
`;
}

function createReadme(targetDir) {
  const relTarget = path.relative(PROJECT_ROOT, targetDir) || ".";
  return `# SvgEditor Local Copy

这个目录由 \`scripts/exportReactComponent.mjs\` 自动生成，可直接复制到其他 React 项目中使用。

## 目录说明

- \`app/\`
- \`components/\`
- \`kernel/\`
- \`layers/\`
- \`rendering/\`
- \`App.css\`
- \`index.css\`
- \`SvgEditor.tsx\`
- \`index.ts\`

## 使用方式

在目标项目中引入：

\`\`\`tsx
import { SvgEditor } from "./${path.basename(relTarget)}";

export default function Page() {
  return <SvgEditor style={{ width: "100%", height: "100vh" }} />;
}
\`\`\`

## 依赖

目标 React 项目需要安装：

\`\`\`bash
npm install ${PACKAGE_DEPENDENCIES.join(" ")}
\`\`\`

如果是 Next.js / SSR 项目，请改为客户端动态加载，避免在服务端直接执行。
`;
}

function main() {
  const targetDir = resolveTargetDir(process.argv[2]);
  ensureDir(targetDir);

  const { files, unresolvedLocalImports } = collectDeps(ENTRY_FILES);
  const copiedFiles = files.map((file) => copyToTarget(file, targetDir));

  writeText(path.join(targetDir, "SvgEditor.tsx"), createWrapperComponent());
  writeText(path.join(targetDir, "index.ts"), createIndexFile());
  writeText(path.join(targetDir, "README.md"), createReadme(targetDir));

  const summary = {
    projectRoot: PROJECT_ROOT,
    srcRoot: SRC_ROOT,
    targetDir,
    copiedFileCount: copiedFiles.length,
    copiedFiles: copiedFiles.map((file) => path.relative(targetDir, file)).sort(),
    generatedFiles: ["SvgEditor.tsx", "index.ts", "README.md"],
    requiredDependencies: PACKAGE_DEPENDENCIES,
    unresolvedLocalImports,
  };

  console.log(JSON.stringify(summary, null, 2));

  if (unresolvedLocalImports.length > 0) {
    process.exitCode = 1;
  }
}

main();
