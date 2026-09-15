> Document template: v0.4.1

# <center>gl-react</center>

This project is based on [gl-react](https://github.com/gre/gl-react) and is the HarmonyOS adaptation for React Native (OpenHarmony).

The HarmonyOS-adapted version of this third-party library is available for direct download from npm. The new package name is `@react-native-ohos/gl-react`. The version correspondence details are as follows:

| Name | Version | Release Information | Supported RN Version | Supported Autolink | Compile API Version | Community Baseline Version | npm Address |
| ------------ | ------------ | ------------------------------ | ------------- | ------------- |------------------------ | ------------- | ------------- |
| @react-native-ohos/gl-react | [~ 1.0.0-beta.1](https://github.com/cbd1020819393/gl-react/tree/master/packages/gl-react) | [Releases](https://github.com/cbd1020819393/gl-react/releases) | 0.72.* | Yes | API12+ | 6.0.0 | [Npm Address](https://www.npmjs.com/package/@react-native-ohos/gl-react) |

## Introduction

gl-react is a universal React library for writing and composing WebGL shaders.

`@react-native-ohos/gl-react` is its HarmonyOS adaptation (core + HarmonyOS binding + native layer in a single package), equivalent to the combination of gl-react-native + gl-react-expo + expo-gl:

- The core API (`Shaders`/`GLSL`/`Node`/`Bus`/`LinearCopy`/`NearestCopy`/`createSurface`, etc.) is a platform-independent pure JS implementation provided directly by this package;
- GLView is executed by a self-built HarmonyOS native layer (XComponent + EGL/OpenGL ES); the `gl` received in `onContextCreate` is a WebGL1 subset proxy;
- Image textures are decoded via Image Kit before being uploaded (`webgltexture-loader-ohos`).

The single entry exports both the gl-react core API and the HarmonyOS `Surface`, providing a consistent declarative shader API experience on HarmonyOS as on iOS and Android.

## Installation

Go to the project directory and execute the following commands:

**npm**

```bash
npm install @react-native-ohos/gl-react
```

**yarn**

```bash
yarn add @react-native-ohos/gl-react
```

## Link

|                                      | Is supported autolink | Supported RN Version |
|--------------------------------------|-----------------------|----------------------|
| ~ 1.0.0-beta.1                              |  Yes                 |  0.72                |

Projects using AutoLink need to be configured according to this document, AutoLink framework guide: https://gitcode.com/openharmony-sig/ohos_react_native/blob/master/docs/zh-cn/Autolinking.md

If the version you are using supports Autolink and the project has integrated Autolink, you can skip the ManualLink configuration.

<details>
  <summary>ManualLink: This step provides guidance for manually configuring native dependencies.</summary>

Open the `harmony` directory of the HarmonyOS project in DevEco Studio.

> [!TIP] This module requires registering the Package on both the C++ side and the ArkTS side.

### 1. Overrides RN SDK

To ensure the project relies on the same version of the RN SDK, you need to add an `overrides` field in the project's root `oh-package.json5` file, specifying the RN SDK version to be used. The replacement version can be a specific version number, a semver range, or a locally available HAR package or source directory.

For more information about the purpose of this field, please refer to the [official documentation](https://developer.huawei.com/consumer/cn/doc/harmonyos-guides-V5/ide-oh-package-json5-V5#zh-cn_topic_0000001792256137_overrides).

```json
{
  "overrides": {
    "@rnoh/react-native-openharmony": "./react_native_openharmony"
  }
}
```

### 2. Introducing Native Code

Currently, two methods are available:

- Use the HAR file.
- Directly link to the source code.

Method 1 (recommended): Use the HAR file.

> [!TIP] The HAR file is stored in the `harmony` directory in the installation path of the third-party library.

Open `entry/oh-package.json5` file and add the following dependencies:

```json
"dependencies": {
    "@react-native-ohos/gl-react": "file:../../node_modules/@react-native-ohos/gl-react/harmony/gl_react_dev.har"
  }
```

Click the `sync` button in the upper right corner.

Alternatively, run the following instruction on the terminal:

```bash
cd entry
ohpm install
```

Method 2: Directly link to the source code.

> [!TIP] For details, see [Directly Linking Source Code](https://gitcode.com/CPF-RN/usage-docs/blob/master/zh-cn/link-source-code.md).

### 3. Configuring CMakeLists and Introducing gl_react_dev

Open `entry/src/main/cpp/CMakeLists.txt` and add the following code:

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

### 4. Introducing GlReactDevPackage to C++

Open `entry/src/main/cpp/PackageProvider.cpp` and add the following code:

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

### 5. Introducing GlReactDevPackage to ArkTS

Open the `entry/src/main/ets/RNPackagesFactory.ts` file and add the following code:

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

### Running

Click the `sync` button in the upper right corner.

Alternatively, run the following instruction on the terminal:

```bash
cd entry
ohpm install
```

Then build and run the code.

## Constraints

### Compatibility

This document has been verified with the following versions:

1. RNOH: 0.72.x; SDK: HarmonyOS SDK API 12+; IDE: DevEco Studio 5.0+;

### Permission Requirements

When using network textures (`http(s)://`), you need to declare the `ohos.permission.INTERNET` permission in `entry/src/main/module.json5` (a `normal`-level permission, no dynamic request required). Pure local rendering and snapshot export require no permission.

```json
"requestPermissions": [
  {
    "name": "ohos.permission.INTERNET"
  }
]
```

### Resource File Placement

To use local assets packaged in the HAP as shader textures, place the files under `entry/src/main/resources/rawfile` in the HarmonyOS project (`example/harmony/entry/src/main/resources/rawfile` in the example project) and reference them in uniforms as `resource://RAWFILE/<relative path>` (e.g. `resource://RAWFILE/assets/img1.png`).

### API Requirements

> [!TIP] The current third-party library has implemented version isolation, supporting compilation in `API12+` projects and execution on `API12+` ROMs.

## Usage Examples

The following code shows the basic use scenario of the library:

> [!WARNING] Import the HarmonyOS adaptation package `@react-native-ohos/gl-react` when using this library. This package exports both the gl-react core API (`Shaders`/`GLSL`/`Node`/`Bus`/`LinearCopy`/`NearestCopy`/`Uniform`/`createSurface`, etc.) and the HarmonyOS `Surface` from a single entry, so there is no need to install gl-react separately.

### Basic example

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

### Image texture example

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

> [!TIP] Image textures must be passed in URI form (`require()` resource number, `{uri}`, `http(s)://`, `file://`, `data:`, `resource://RAWFILE/...`); they are decoded via Image Kit before being uploaded. The DOM/ImageSource six-argument `texImage2D` form is not supported.

## API Reference

> [!TIP] The **Platform** column indicates the platform where the API is supported in the original third-party library.

> [!TIP] If the value of **HarmonyOS Support** is **yes**, it means that the HarmonyOS platform supports this API; **no** means the opposite; **partially** means some capabilities of this API are supported. The usage method is the same on different platforms and the effect is the same as that of iOS or Android.

### Components

| Name | Parameter Type | Required | Platform | HarmonyOS Support | Description |
|------|----------------|----------|----------|-------------------|-------------|
| Surface | [SurfaceProps](#surfaceprops) | yes | all | yes | GL rendering surface component (layoutable) |
| Node | [NodeProps](#nodeprops) | No | all | yes | Shader node component; nodes can be nested (a child Node's output texture becomes a uniform input to its parent) |
| Bus | — | No | all | yes | Texture bus; shares one computation across multiple consumers |
| LinearCopy / NearestCopy | — | No | all | yes | Texture copy rendering containers (linear/nearest sampling) |
| Uniform | — | No | all | yes | Declarative uniforms (Uniform.Resolution / Uniform.Backbuffer / Uniform.textureSizeRatio) |

### Properties

**SurfaceProps**

| Name | Parameter Type | Default | Required | Platform | HarmonyOS Support | Description |
|------|----------------|---------|----------|----------|-------------------|-------------|
| style | ViewStyle | None | No | All | yes | Style to apply on the surface (including width/height) |
| children | ReactNode | None | No | All | yes | Node tree (the root Node draws directly to the Surface canvas) |
| preload | Array\<any> | None | No | All | yes | Textures to preload (URI/require resource/NDArray) |
| onLoad | Function | None | No | All | yes | Callback when texture preloading completes |
| onLoadError | Function | None | No | All | yes | Callback when texture preloading fails; the parameter is an Error |
| onContextLost | Function | None | No | All | yes | Callback when the GL context is lost |
| onContextRestored | Function | None | No | All | yes | Callback when the GL context is restored; surface destruction/rebuild restores automatically and resources of the same context are preserved |
| visitor | VisitorLike | None | No | All | yes | Render tree visitor (for debugging) |
| debug | boolean | false | No | All | yes | Enable debug mode |

**NodeProps**

| Name | Parameter Type | Default | Required | Platform | HarmonyOS Support | Description |
|------|----------------|---------|----------|----------|-------------------|-------------|
| shader | ShaderIdentifier / ShaderDefinition | None | yes | All | yes | Shader handle created by Shaders.create |
| uniforms | object | None | No | All | yes | Uniform values (scalars, arrays, textures, NDArray, etc.) |
| uniformsOptions | object | None | No | All | yes | Texture sampling options (filtering/wrapping, etc.) |
| sync | boolean | false | No | All | yes | Synchronous flush mode (default is async batched flush at 60fps) |
| width / height | Number | None | No | All | yes | Offscreen FBO size |
| backbuffering | boolean | false | No | All | yes | Enable ping-pong double buffering; read the previous frame via Uniform.Backbuffer |
| blendFunc | {src, dst} | None | No | All | yes | Blend function |
| clear | {color: Vec4} / null | None | No | All | yes | Clear color applied before drawing |
| ignoreUnusedUniforms | Array\<string> / boolean | None | No | All | yes | Suppress warnings for unused uniforms |
| onDraw | Function | None | No | All | yes | Callback after each draw |

### API

| Name | Type | Parameter Type | Return Value | Required | Platform | HarmonyOS Support | Description |
|------|------|----------------|--------------|----------|----------|-------------------|-------------|
| Surface#captureAsDataURL | function | ({format, quality}) | Promise\<string> | No | All | yes | Export the last rendered frame as a dataURL; PNG by default, jpeg requests fall back to PNG (identical content) |
| Surface#captureAsBlob | function | ({format, quality}) | Promise\<Blob> | No | All | yes | Export the last rendered frame as a Blob; same fallback as above |
| Surface#capture | function | (x?, y?, w?, h?) | NDArray | No | All | yes | Read pixels back as an NDArray (native synchronous readPixels) |
| Surface#redraw / flush | function | / | void | No | All | yes | Request a redraw / draw immediately |
| Surface#rebootForDebug | function | / | void | No | All | yes | Destroy and rebuild the GL view |
| Surface#glIsAvailable | function | / | boolean | No | All | yes | Whether the GL context is ready |
| takeSnapshotAsync | function | ({format, quality}) | Promise\<{uri, localUri, width, height}> | No | All | yes | expo-gl equivalent API; exports a snapshot file (written to the app sandbox cache with a file:// URI; jpeg falls back to PNG) |
| Shaders.create | function | ({name: {frag, vert?}}) | Shader handle | No | All | yes | Declare shaders |
| GLSL | tagged template | GLSL source string | string | No | All | yes | Tagged template literal for shader sources |
| createSurface | function | ({GLView, ...}) | Surface component | No | All | yes | Surface factory (for platform bindings) |
| listSurfaces | function | / | Surface list | No | All | yes | List living Surfaces |
| connectSize | function | Component | Component | No | All | yes | Inject the parent size into a component |
| Visitor / VisitorLogger | class | / | / | No | All | yes | Render tree visitor and its logging implementation |
| Uniform.Backbuffer / Resolution / textureSizeRatio | static | / | / | No | All | yes | Declarative special uniforms |
| GL constants | constant | / | / | No | All | yes | WebGL1 constants (exported as `GL`) |
| gl.getEndFrame / endFrameEXP | function | / | void | No | All | yes | Frame submission (eglSwapBuffers + snapshot retention) |
| gl.getExtension / getSupportedExtensions | function | name | object \| null | No | All | partially | Returns null with a warning; driver extensions are not bridged to the WebGL extension surface |
| gl.getParameter | function | pname: number | number | No | All | partially | Only numeric scalars; range/string pnames return -1 or 0 |
| gl.texImage2D six-argument DOM source form | function | (target, level, ifmt, fmt, type, source) | void | No | All | no | No browser semantics; use the texture loader URI path instead |
| SurfaceType | type | / | / | No | All | yes | TS type of the Surface component (`ReturnType<typeof createSurface>`), useful for typing refs |
| format: 'image/jpeg' snapshot | — | format | — | No | All | partially | No pure native JPEG encoding entry is available; falls back to PNG with identical pixel content |

### Platform Differences

- **Frame retention semantics**: The last rendered frame is always retained (a superset of WebGL `preserveDrawingBuffer: true`), so `capture`/snapshot export can always be read; this is transparent to gl-react's declarative rendering.
- **Pixel semantics**: `UNPACK_FLIP_Y_WEBGL`, `UNPACK_PREMULTIPLY_ALPHA_WEBGL`, and `UNPACK_ALIGNMENT` are aligned one by one on the native upload path; `UNPACK_COLORSPACE_CONVERSION_WEBGL` is accepted and ignored (native decoding has no corresponding concept).
- **Context lifecycle**: Surface destruction caused by page navigation is no longer treated as context loss (GL resources survive across surfaces), and `onContextRestored` is restored at zero cost after rebuilding.
- **Synchronous queries**: `getShaderParameter`/`getUniformLocation`/`getUniform` etc. first submit queued commands and then execute synchronously on the native side, consistent with WebGL ordering semantics; `ACTIVE_ATTRIBUTES`/`ACTIVE_UNIFORMS` are cached per program on the JS side.

### Usage Restrictions

- GL calls are batched in JS and dispatched across the language boundary once per frame; examples of this scale (≤10 nodes) run smoothly. For larger node trees with high-frequency uniform paths, a direct-dispatch optimization can be applied as needed.
- Remote textures (`http(s)://`) require the app to have network permission and a reachable network; failures are reported via `onLoadError`.

## Quick Verification (Running the RNOH Example)

This package ships with an RNOH verification project `example` (located at `packages/gl-react/example`, depending on this package via `file:..`). All cases are written the community way (`gl-react` + `gl-react-expo` + `@oh-rn/expo-gl`, where `gl-react` is metro-redirected to this package's core implementation) and share the same GL native foundation as this package (ExGLView + EGL/GLES) with an identical contract.

Covered scenarios: scalar/array/multi-vec uniforms, connectSize, LinearCopy/NearestCopy, Bus, Uniform.Resolution/Backbuffer, backbuffering, blendFunc/clear, snapshot export, and more.

### Prerequisites

| Dependency | Version Requirement |
|------------|---------------------|
| Node.js | >= 18 |
| DevEco Studio | 5.0+ / 6.0+ |
| HarmonyOS SDK | API 12+ |

### Steps

**1. Clone the repository**

```bash
git clone <repository address>
cd <repository directory>/packages/gl-react
```

**2. Obtain the @oh-rn/expo-gl package**

The example depends on `@oh-rn/expo-gl` via a local tgz: run `npm pack` in its package directory (`packages/expo-gl` of the expo fork repository), and place the generated `oh-rn-expo-gl-58.0.0.tgz` under the `packages/gl-react` directory.

**3. Enter the example directory and install dependencies**

```bash
cd example
npm install --legacy-peer-deps
```

**4. Generate the JS bundle**

```bash
npm run dev
```

Output: `harmony/entry/src/main/resources/rawfile/bundle.harmony.js`

**5. Open the HarmonyOS project in DevEco Studio**

- Open DevEco Studio
- Select the `example/harmony` directory
- Wait for Sync to finish

**6. Build and run the HAP**

Click the run button in DevEco Studio to install the HAP on a device or emulator.

> [!TIP] The steps above can be run via the built-in example scripts: `npm run i` (install both ends), `npm run fast:pkg` (build the dependency and generate a dev bundle), `npm run prod` (production bundle), `npm run install:pkg` (repack and install this library's tgz).

> [!TIP] The Example already includes plugin dependencies and Package registration (including the texture asset bridge AssetFileBridgePackage), so no manual Link configuration is required.

## Known Issues

- [ ] WebGL extensions are not bridged (`getExtension` returns null); capabilities such as float linear filtering rely on the built-in uint8 fallback path.
- [ ] The `image/jpeg` snapshot format falls back to PNG (pixel content is identical; only the container format differs).
- [ ] The six-argument DOM/ImageSource form of `gl.texImage2D` is not supported (textures are always uploaded in the full nine-argument form via the texture loader).
- [ ] Concurrent rendering of multiple Surfaces on the same screen is limited (the verification project keeps only 1 Surface on screen at a time).

## Others

### Differences from the Upstream Library

- The declarative usage is identical to gl-react-native; rendering is executed by a self-built native layer (XComponent + EGL/OpenGL ES), and the `gl` received in `onContextCreate` is a WebGL1 subset proxy (batched dispatch, with synchronous queries executed in order on the native side).
- Snapshot format: no pure native JPEG encoding entry is currently available on the native side, so snapshot requests with `format: 'image/jpeg'` fall back to PNG with identical pixel content; only the container format differs.
- WebGL extensions: the HarmonyOS GLES driver does not expose the WebGL extension surface, so `getExtension` returns null (the float path of webgltexture-loader-ndarray automatically falls back to uint8).

## Directory Structure

````
/gl-react                           # Project root (upstream monorepo fork)
└── packages/gl-react               # The @react-native-ohos/gl-react package (single HarmonyOS adaptation package)
    ├── src                         # RN code (core + HarmonyOS binding)
    │   ├── index.ts                # Package entry (re-exports core API + HarmonyOS Surface)
    │   ├── Bus.tsx / Node.tsx / Shaders.ts / GLSL.ts / createSurface.tsx etc.  # Upstream core
    │   ├── GLViewNative.tsx        # GLView HarmonyOS binding component
    │   ├── WebGLRenderingContextOHOS.ts # WebGL1 subset proxy
    │   ├── webgltexture-loader-ohos.ts  # OHOS image texture loader (Image Kit)
    │   ├── webgl1-constants.ts     # WebGL1 constants
    │   └── specs                   # codegen spec files
    ├── harmony                     # HarmonyOS adaptation code
    │   ├── gl_react_dev.har        # HAR package
    │   └── gl_react_dev            # HarmonyOS adaptation core code
    │       └── src/main
    │           ├── ets
    │           │   ├── GlReactView.ets                 # HarmonyOS adaptation rendering view entry
    │           │   ├── GlReactDevTurboModulesFactory.ets # TurboModules registration
    │           │   ├── GlImageLoaderModule.ets         # Image texture loading (Image Kit)
    │           │   └── generated/                      # Codegen generated components/TurboModules
    │           └── cpp
    │               ├── GlReactDevPackage.h             # C++ Package entry
    │               ├── gl_webgl_context.cpp            # WebGL1 subset proxy (EGL/GLES executor)
    │               ├── ExGLCppTurboModule.cpp          # Batched GL command dispatch
    │               └── generated/                      # Codegen generated C++ code
    ├── example                     # RNOH verification project (includes harmony native project)
    ├── README.md                   # Chinese installation guide
    └── README_EN.md                # English installation guide
````

## Contributing

If you find any problems during use, please submit an [Issue](https://github.com/cbd1020819393/gl-react/issues). Pull requests are also welcome via [PR](https://github.com/cbd1020819393/gl-react/pulls).

## License

This project is licensed under [The MIT License (MIT)](./LICENSE) of the original [gl-react](https://github.com/gre/gl-react) library.
