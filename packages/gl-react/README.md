> 文档模板：v0.4.1

# <center>gl-react</center>

本项目基于 [gl-react](https://github.com/gre/gl-react) 开发，为 React Native 鸿蒙（OpenHarmony）适配版本。

该三方库的鸿蒙适配版本支持直接从 npm 下载，新的包名为：`@react-native-ohos/gl-react`，版本所属关系如下：

| 三方库名称    | 三方库版本    | 发布信息     | 支持RN版本    | Autolink     | 编译API版本     | 社区基线版本    | npm地址                |
| ------------ | ------------ | ------------------------------ | ------------- | ------------- |------------------------ | ------------- | ------------- |
| @react-native-ohos/gl-react | [~ 1.0.0-beta.1](https://github.com/cbd1020819393/gl-react/tree/master/packages/gl-react) | [Releases](https://github.com/cbd1020819393/gl-react/releases) | 0.72.* | 是 | API12+ | 6.0.0 | [Npm Address](https://www.npmjs.com/package/@react-native-ohos/gl-react) |

## 简介

gl-react 是一个通用的 React 库，用于编写和组合 WebGL 着色器。

`@react-native-ohos/gl-react` 是其鸿蒙适配版本（核心 + 鸿蒙绑定 + 原生层单包），等价于 gl-react-native + gl-react-expo + expo-gl 的组合：

- 核心 API（`Shaders`/`GLSL`/`Node`/`Bus`/`LinearCopy`/`NearestCopy`/`createSurface` 等）为平台无关纯 JS 实现，随本包直接提供；
- GLView 由自建鸿蒙原生层执行（XComponent + EGL/OpenGL ES），`onContextCreate` 收到的 `gl` 为 WebGL1 子集代理；
- 图片纹理经 Image Kit 解码后上传（`webgltexture-loader-ohos`）。

单一入口同时导出 gl-react 核心 API 与鸿蒙 `Surface`，可在鸿蒙平台上提供与 iOS/Android 一致的声明式着色器 API 使用体验。

## 下载安装

进入到工程目录并输入以下命令：

**npm**

```bash
npm install @react-native-ohos/gl-react
```

**yarn**

```bash
yarn add @react-native-ohos/gl-react
```

## Link

|                                      | 是否支持autolink | RN框架版本 |
|--------------------------------------|-----------------|------------|
| ~ 1.0.0-beta.1                              |  Yes             |  0.72     |

使用AutoLink的工程需要根据该文档配置，Autolink框架指导文档：https://gitcode.com/openharmony-sig/ohos_react_native/blob/master/docs/zh-cn/Autolinking.md

如您使用的版本支持 Autolink，并且工程已接入 Autolink，可跳过ManualLink配置。
<details>
  <summary>ManualLink: 此步骤为手动配置原生依赖项的指导</summary>

首先需要使用 DevEco Studio 打开项目里的 HarmonyOS 工程 `harmony`。

> [!TIP] 本模块需要同时在 C++ 侧和 ETS 侧注册 Package。

### 1. Overrides RN SDK

为了让工程依赖同一个版本的 RN SDK，需要在工程根目录的 `oh-package.json5` 添加 overrides 字段，指向工程需要使用的 RN SDK 版本。替换的版本既可以是一个具体的版本号，也可以是一个模糊版本，还可以是本地存在的 HAR 包或源码目录。

关于该字段的作用请阅读[官方说明](https://developer.huawei.com/consumer/cn/doc/harmonyos-guides-V5/ide-oh-package-json5-V5#zh-cn_topic_0000001792256137_overrides)

```json
{
  "overrides": {
    "@rnoh/react-native-openharmony": "./react_native_openharmony"
  }
}
```

### 2. 引入原生端代码

目前有两种方法：

- 通过 har 包引入；
- 直接链接源码。

方法一：通过 har 包引入（推荐）

> [!TIP] har 包位于三方库安装路径的 `harmony` 文件夹下。

打开 `entry/oh-package.json5`，添加以下依赖

```json
"dependencies": {
    "@react-native-ohos/gl-react": "file:../../node_modules/@react-native-ohos/gl-react/harmony/gl_react_dev.har"
  }
```

点击右上角的 `sync` 按钮

或者在命令行终端执行：

```bash
cd entry
ohpm install
```

方法二：直接链接源码

> [!TIP] 如需使用直接链接源码，请参考[直接链接源码说明](https://gitcode.com/CPF-RN/usage-docs/blob/master/zh-cn/link-source-code.md)

### 3. 配置 CMakeLists 并引入 gl_react_dev

打开 `entry/src/main/cpp/CMakeLists.txt`，添加：

```diff
project(rnapp)
cmake_minimum_required(VERSION 3.4.1)
set(RNOH_APP_DIR "${CMAKE_CURRENT_SOURCE_DIR}")
+ set(OH_MODULES "${CMAKE_CURRENT_SOURCE_DIR}/../../../oh_modules")
set(RNOH_CPP_DIR "${CMAKE_CURRENT_SOURCE_DIR}/../../../../../../react-native-harmony/harmony/cpp")

add_subdirectory("${RNOH_CPP_DIR}" ./rn)

# RNOH_BEGIN: manual_package_linking_1
+ add_subdirectory("${OH_MODULES}/@react-native-ohos/gl-react/src/main/cpp" ./gl_react_dev)
# RNOH_END: manual_package_linking_1

add_library(rnoh_app SHARED
    "./PackageProvider.cpp"
    "${RNOH_CPP_DIR}/RNOHAppNapiBridge.cpp"
)

target_link_libraries(rnoh_app PUBLIC rnoh)

# RNOH_BEGIN: manual_package_linking_2
+ target_link_libraries(rnoh_app PUBLIC gl_react_dev)
# RNOH_END: manual_package_linking_2
```

### 4. 在 C++ 侧注册 GlReactDevPackage

打开 `entry/src/main/cpp/PackageProvider.cpp`，添加：

```diff
#include "RNOH/PackageProvider.h"
+ #include "GlReactDevPackage.h"

using namespace rnoh;

std::vector<std::shared_ptr<Package>> PackageProvider::getPackages(Package::Context ctx) {
    return {
+        std::make_shared<GlReactDevPackage>(ctx)
    };
}
```

### 5. 在 ArkTS 侧注册 GlReactDevPackage

打开 `entry/src/main/ets/RNPackagesFactory.ts`，添加：

```diff
  ...
+ import { GlReactDevPackage } from "@react-native-ohos/gl-react/ts";

export function createRNPackages(ctx: RNPackageContext): RNPackage[] {
  return [
    new SamplePackage(ctx),
+   new GlReactDevPackage(ctx),
  ];
}
```
</details>

### 运行

点击右上角的 `sync` 按钮

或者在命令行终端执行：

```bash
cd entry
ohpm install
```

然后编译、运行即可。

## 约束与限制

### 兼容性

本文档内容基于以下版本验证通过：
1. RNOH: 0.72.x; SDK: HarmonyOS SDK API 12+; IDE: DevEco Studio 5.0+;

### 权限要求

使用网络纹理（`http(s)://`）时需在 `entry/src/main/module.json5` 中声明 `ohos.permission.INTERNET`（normal 级权限，无需动态申请）；纯本地渲染与快照导出免权限。

```json
"requestPermissions": [
  {
    "name": "ohos.permission.INTERNET"
  }
]
```

### 资源文件放置说明

着色器纹理如需使用打包在 HAP 内的本地资源，请将文件放置在鸿蒙工程的 `entry/src/main/resources/rawfile` 目录（example 工程中为 `example/harmony/entry/src/main/resources/rawfile`），并在 uniform 中以 `resource://RAWFILE/<相对路径>` 形式引用（如 `resource://RAWFILE/assets/img1.png`）。

### 编译运行API要求

> [!TIP] 当前三方库已实现版本隔离，支持在 `API12+` 工程编译，及 `API12+` ROM运行。

## 使用示例

下面的代码展示了这个库的基本使用场景：

> [!WARNING] 使用时 import 鸿蒙适配包 `@react-native-ohos/gl-react`。本包从单一入口导出 gl-react 核心 API（`Shaders`/`GLSL`/`Node`/`Bus`/`LinearCopy`/`NearestCopy`/`Uniform`/`createSurface` 等）与鸿蒙 `Surface`，无需再单独引入 gl-react。

### 基础示例

```tsx
import React from 'react';
import {Surface, Node, Shaders, GLSL} from '@react-native-ohos/gl-react';

const shaders = Shaders.create({
  helloBlue: {
    frag: GLSL`
precision highp float;
varying vec2 uv;
uniform float blue;
void main() {
  gl_FragColor = vec4(uv.x, uv.y, blue, 1.0);
}`,
  },
});

const HelloBlue = (props: {blue: number}) => {
  const uniforms = {blue: props.blue};
  return <Node shader={shaders.helloBlue} uniforms={uniforms} />;
};

const surfaceStyle = {width: 300, height: 300};

export default () => (
  <Surface style={surfaceStyle}>
    <HelloBlue blue={0.8} />
  </Surface>
);
```

### 图片纹理示例

```tsx
import React from 'react';
import {Surface, Node, Shaders, GLSL} from '@react-native-ohos/gl-react';

const shaders = Shaders.create({
  saturate: {
    frag: GLSL`
precision highp float;
varying vec2 uv;
uniform sampler2D tex;
uniform float saturation;
void main() {
  vec4 c = texture2D(tex, uv);
  float g = dot(c.rgb, vec3(0.299, 0.587, 0.114));
  gl_FragColor = vec4(mix(vec3(g), c.rgb, saturation), c.a);
}`,
  },
});

export default () => (
  <Surface style={{width: 300, height: 300}}>
    <Node
      shader={shaders.saturate}
      uniforms={{
        tex: {uri: 'https://server/path/photo.jpg'},
        saturation: 0.8,
      }}
    />
  </Surface>
);
```

> [!TIP] 图片纹理请传 URI 形态（`require()` 资源数字、`{uri}`、`http(s)://`、`file://`、`data:`、`resource://RAWFILE/...`），经 Image Kit 解码后上传；不支持 DOM/ImageSource 六参 `texImage2D`。

## 接口说明

> [!TIP] "Platform"列表示该接口在原三方库上支持的平台。

> [!TIP] "HarmonyOS Support"列为 yes 表示 HarmonyOS 平台支持该接口；no 则表示不支持；partially 表示部分支持。使用方法跨平台一致，效果对齐 iOS 或 Android 的效果。

### 组件

| 名称 | 参数类型 | 必填 | 平台 | HarmonyOS Support | 描述 |
|------|---------|------|------|-------------------|------|
| Surface | [SurfaceProps](#surfaceprops) | yes | all | yes | GL 渲染面组件（可布局） |
| Node | [NodeProps](#nodeprops) | No | all | yes | 着色器节点组件，可嵌套组合（子 Node 输出纹理作为父 Node 的 uniform 输入） |
| Bus | — | No | all | yes | 纹理总线，跨多个消费者共享一份计算 |
| LinearCopy / NearestCopy | — | No | all | yes | 纹理拷贝渲染容器（线性/最近邻采样） |
| Uniform | — | No | all | yes | 声明式 uniform（Uniform.Resolution / Uniform.Backbuffer / Uniform.textureSizeRatio） |

### 属性

**SurfaceProps**

| 名称 | 参数类型 | 默认值 | 必填 | 平台 | HarmonyOS Support | 描述 |
|------|---------|--------|------|------|-------------------|------|
| style | ViewStyle | None | No | All | yes | 应用在渲染面上的样式（含 width/height） |
| children | ReactNode | None | No | All | yes | Node 树（根 Node 直接绘制到 Surface 画布） |
| preload | Array\<any> | None | No | All | yes | 需预加载的纹理（URI/require 资源/NDArray） |
| onLoad | Function | None | No | All | yes | 纹理预加载完成回调 |
| onLoadError | Function | None | No | All | yes | 纹理预加载失败回调，参数为 Error |
| onContextLost | Function | None | No | All | yes | GL 上下文失效回调 |
| onContextRestored | Function | None | No | All | yes | GL 上下文恢复回调；surface 销毁重建自动恢复，同一上下文资源保留 |
| visitor | VisitorLike | None | No | All | yes | 渲染树访问器（调试用） |
| debug | boolean | false | No | All | yes | 开启调试模式 |

**NodeProps**

| 名称 | 参数类型 | 默认值 | 必填 | 平台 | HarmonyOS Support | 描述 |
|------|---------|--------|------|------|-------------------|------|
| shader | ShaderIdentifier / ShaderDefinition | None | yes | All | yes | 着色器句柄（由 Shaders.create 创建） |
| uniforms | object | None | No | All | yes | uniform 值（标量、数组、纹理、NDArray 等） |
| uniformsOptions | object | None | No | All | yes | 纹理采样选项（插值/包裹方式等） |
| sync | boolean | false | No | All | yes | 同步 flush 模式（默认 60fps 异步批量 flush） |
| width / height | Number | None | No | All | yes | 离屏 FBO 尺寸 |
| backbuffering | boolean | false | No | All | yes | 启用乒乓双缓冲，配合 Uniform.Backbuffer 读上一帧 |
| blendFunc | {src, dst} | None | No | All | yes | 混合函数 |
| clear | {color: Vec4} / null | None | No | All | yes | 绘制前清屏颜色 |
| ignoreUnusedUniforms | Array\<string> / boolean | None | No | All | yes | 忽略未使用的 uniform 告警 |
| onDraw | Function | None | No | All | yes | 每次绘制完成回调 |

### API

| 名称 | 类型 | 参数类型 | 返回值 | 必填 | 平台 | HarmonyOS Support | 描述 |
|------|------|---------|--------|------|------|-------------------|------|
| Surface#captureAsDataURL | function | ({format, quality}) | Promise\<string> | No | All | yes | 导出最近一帧为 dataURL；PNG 默认，jpeg 请求回退 PNG（内容一致） |
| Surface#captureAsBlob | function | ({format, quality}) | Promise\<Blob> | No | All | yes | 导出最近一帧为 Blob；回退说明同上 |
| Surface#capture | function | (x?, y?, w?, h?) | NDArray | No | All | yes | 像素读回 NDArray（原生同步 readPixels） |
| Surface#redraw / flush | function | / | void | No | All | yes | 请求重绘 / 立即绘制 |
| Surface#rebootForDebug | function | / | void | No | All | yes | 销毁并重建 GL 视图 |
| Surface#glIsAvailable | function | / | boolean | No | All | yes | 上下文是否就绪 |
| takeSnapshotAsync | function | ({format, quality}) | Promise\<{uri, localUri, width, height}> | No | All | yes | expo-gl 等价接口，导出快照文件（写入应用沙箱 cache，file:// URI；jpeg 回退 PNG） |
| Shaders.create | function | ({name: {frag, vert?}}) | Shader 句柄 | No | All | yes | 声明着色器 |
| GLSL | tagged template | GLSL 源码字符串 | string | No | All | yes | 着色器源码模板标签 |
| createSurface | function | ({GLView, ...}) | Surface 组件 | No | All | yes | Surface 工厂（平台绑定用） |
| listSurfaces | function | / | Surface 列表 | No | All | yes | 列出存活的 Surface |
| connectSize | function | 组件 | 组件 | No | All | yes | 为组件注入父级尺寸 |
| Visitor / VisitorLogger | class | / | / | No | All | yes | 渲染树访问器及日志实现 |
| Uniform.Backbuffer / Resolution / textureSizeRatio | static | / | / | No | All | yes | 声明式特殊 uniform |
| GL 常量 | constant | / | / | No | All | yes | WebGL1 常量（以 `GL` 导出） |
| gl.getEndFrame / endFrameEXP | function | 无 | void | No | All | yes | 帧提交（eglSwapBuffers + 快照保留） |
| gl.getExtension / getSupportedExtensions | function | name | object \| null | No | All | partially | 返回 null 并告警；驱动扩展未按 WebGL 扩展面桥接 |
| gl.getParameter | function | pname: number | number | No | All | partially | 仅数值标量；范围/字符串型 pname 返回 -1 或 0 |
| gl.texImage2D 六参 DOM 源形式 | function | (target, level, ifmt, fmt, type, source) | void | No | All | no | 无浏览器语义；请走纹理 loader URI 路径 |
| SurfaceType | type | / | / | No | All | yes | Surface 组件的 TS 类型（`ReturnType<typeof createSurface>`），可用作 ref 的类型标注 |
| format: 'image/jpeg' 快照 | — | format | — | No | All | partially | 原生无纯 native JPEG 编码入口，回退 PNG，像素内容一致 |

### 平台差异

- **帧保留语义**：实现固定保留最后一帧（等价 WebGL `preserveDrawingBuffer: true` 的超集），`capture`/快照导出始终可读；对 gl-react 的声明式渲染无感知。
- **像素语义**：`UNPACK_FLIP_Y_WEBGL`、`UNPACK_PREMULTIPLY_ALPHA_WEBGL`、`UNPACK_ALIGNMENT` 在原生上传路径逐一对齐；`UNPACK_COLORSPACE_CONVERSION_WEBGL` 接受并忽略（原生解码无对应概念）。
- **上下文生命周期**：页面切换导致的 surface 销毁不再视为上下文丢失（GL 资源跨 surface 存活），重建后零成本恢复 `onContextRestored`。
- **同步查询**：`getShaderParameter`/`getUniformLocation`/`getUniform` 等会先提交已排队命令再在原生侧同步执行，与 WebGL 顺序语义一致；`ACTIVE_ATTRIBUTES`/`ACTIVE_UNIFORMS` 按 program 在 JS 侧缓存。

### 使用限制

- GL 调用经 JS 批处理后每帧一次跨语言下发；示例规模（≤10 节点）可流畅运行，更大规模节点树的高频 uniform 路径可按需直连优化。
- 远程纹理（`http(s)://`）需应用具备网络权限与可达网络；失败走 `onLoadError`。

## 快速验证（运行 RNOH Example）

本包随附 RNOH 验证工程 `example`（位于 `packages/gl-react/example`，经 `file:..` 依赖本包）。所有用例均按社区方式编写（`gl-react` + `gl-react-expo` + `@oh-rn/expo-gl`，其中 `gl-react` 经 metro 重定向至本包核心实现），与本包共享同一套 GL 原生底座（ExGLView + EGL/GLES），契约一致。

覆盖场景：标量/数组/多 vec uniform、connectSize、LinearCopy/NearestCopy、Bus、Uniform.Resolution/Backbuffer、backbuffering、blendFunc/clear、快照导出等。

### 前置条件

| 依赖 | 版本要求 |
|------|----------|
| Node.js | >= 18 |
| DevEco Studio | 5.0+ / 6.0+ |
| HarmonyOS SDK | API 12+ |

### 运行步骤

**1. 克隆仓库**

```bash
git clone <仓库地址>
cd <仓库目录>/packages/gl-react
```

**2. 获取 @oh-rn/expo-gl 包**

example 通过本地 tgz 依赖 `@oh-rn/expo-gl`：在其包目录（expo fork 仓库的 `packages/expo-gl`）执行 `npm pack`，将生成的 `oh-rn-expo-gl-58.0.0.tgz` 放到 `packages/gl-react` 目录下。

**3. 进入 example 目录，安装依赖**

```bash
cd example
npm install --legacy-peer-deps
```

**4. 生成 JS Bundle**

```bash
npm run dev
```

产物：`harmony/entry/src/main/resources/rawfile/bundle.harmony.js`

**5. 用 DevEco Studio 打开鸿蒙工程**

- 打开 DevEco Studio
- 选择 `example/harmony` 目录
- 等待 Sync 完成

**6. 编译并运行 HAP**

在 DevEco Studio 中点击运行按钮，将 HAP 安装到设备/模拟器。

> [!TIP] 上述步骤可用 example 内置脚本一键执行：`npm run i`（双端安装）、`npm run fast:pkg`（构建依赖并生成 dev bundle）、`npm run prod`（生产 bundle）、`npm run install:pkg`（重新打包并安装本库 tgz）。

> [!TIP] Example 中已预置插件依赖和 Package 注册（含纹理资源桥接 AssetFileBridgePackage），无需手动配置 Link。

## 遗留问题

- [ ] WebGL 扩展未桥接（`getExtension` 返回 null）；如需 float 线性过滤等扩展能力，依赖内置的 uint8 降级路径。
- [ ] `image/jpeg` 快照格式回退为 PNG（像素内容一致，仅封装格式不同）。
- [ ] 不支持 `gl.texImage2D` 六参 DOM/ImageSource 源形式（统一经纹理 loader 以九参全量形式上传）。
- [ ] 同屏多个 Surface 并发渲染存在限制（验证工程中同屏仅保留 1 个 Surface）。

## 其他

### 与源库差异说明

- 声明式用法与 gl-react-native 完全一致；渲染由自建原生层执行（XComponent + EGL/OpenGL ES），`onContextCreate` 收到的 `gl` 为 WebGL1 子集代理（批处理下发，同步查询在原生侧顺序执行）。
- 快照格式：原生侧当前无纯 native JPEG 编码入口，`format: 'image/jpeg'` 的快照请求回退 PNG，像素内容一致，仅封装格式不同。
- WebGL 扩展：鸿蒙 GLES 驱动未按 WebGL 扩展面暴露，`getExtension` 返回 null（webgltexture-loader-ndarray 的 float 路径自动降级 uint8）。

## 目录结构

````
/gl-react                           # 项目根目录（上游 monorepo fork）
└── packages/gl-react               # @react-native-ohos/gl-react 包（鸿蒙适配单包）
    ├── src                         # RN 代码（核心 + 鸿蒙绑定）
    │   ├── index.ts                # 包入口（re-export 核心 API + 鸿蒙 Surface）
    │   ├── Bus.tsx / Node.tsx / Shaders.ts / GLSL.ts / createSurface.tsx 等  # 上游核心
    │   ├── GLViewNative.tsx        # GLView 鸿蒙绑定组件
    │   ├── WebGLRenderingContextOHOS.ts # WebGL1 子集代理
    │   ├── webgltexture-loader-ohos.ts  # OHOS 图片纹理 loader（Image Kit）
    │   ├── webgl1-constants.ts     # WebGL1 常量
    │   └── specs                   # codegen 规格文件
    ├── harmony                     # 鸿蒙适配代码
    │   ├── gl_react_dev.har        # har 包
    │   └── gl_react_dev            # 鸿蒙适配核心代码
    │       └── src/main
    │           ├── ets
    │           │   ├── GlReactView.ets                 # 鸿蒙适配渲染视图入口
    │           │   ├── GlReactDevTurboModulesFactory.ets # TurboModules 注册
    │           │   ├── GlImageLoaderModule.ets         # 图片纹理加载（Image Kit）
    │           │   └── generated/                      # Codegen 生成组件/TurboModules
    │           └── cpp
    │               ├── GlReactDevPackage.h             # C++ Package 入口
    │               ├── gl_webgl_context.cpp            # WebGL1 子集代理（EGL/GLES 执行器）
    │               ├── ExGLCppTurboModule.cpp          # GL 命令批处理下发
    │               └── generated/                      # Codegen 生成 C++ 代码
    ├── example                     # RNOH 验证工程（含 harmony 原生工程）
    ├── README.md                   # 中文安装使用方法
    └── README_EN.md                # 英文安装使用方法
````

## 贡献代码

使用过程中发现任何问题都可以提交 [Issue](https://github.com/cbd1020819393/gl-react/issues)，当然，也非常欢迎提交 [PR](https://github.com/cbd1020819393/gl-react/pulls) 。

## 开源协议

本项目基于原库 [gl-react](https://github.com/gre/gl-react) 的 [The MIT License (MIT)](./LICENSE) ，请自由地享受和参与开源。
