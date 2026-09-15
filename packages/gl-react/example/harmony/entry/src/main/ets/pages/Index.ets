/**
 * This source code is licensed under the MIT license found in the
 * LICENSE-MIT file in the root directory of this source tree.
 */

import {
  AnyJSBundleProvider,
  ComponentBuilderContext,
  FileJSBundleProvider,
  MetroJSBundleProvider,
  ResourceJSBundleProvider,
  RNApp,
  RNOHErrorDialog,
  RNOHLogger,
  TraceJSBundleProviderDecorator,
  RNOHCoreContext
} from '@rnoh/react-native-openharmony';
import { createRNPackages } from '../RNPackagesFactory';
import { ExpoGLView } from '@oh-rn/expo-gl';
import { fileIo as fs } from '@kit.CoreFileKit';
import { http } from '@kit.NetworkKit';
import { resourceManager } from '@kit.LocalizationKit';
import { BusinessError } from '@kit.BasicServicesKit';
// GEN:FABRIC_IMPORTS_BEGIN
// GEN:FABRIC_IMPORTS_END

// GEN:FABRIC_ARK_CONST_BEGIN
// GEN:FABRIC_ARK_CONST_END

// 预导出的 rawfile 资源（demo 纹理）；shim 侧确定性对应：
// asset://<name> → file://<cacheDir>/gl_asset_<name 中 / 换 _>
// 注意：RNOH 的 assetsDest 默认 "assets/"，rawfile 实际名为 assets/assets/<file>
const PRELOAD_RAWFILES: string[] = [
  'assets/assets/img1.png',
  'assets/assets/mario.png',
];
// 预下载的远程资源（用例 6）；shim 侧对应：
// https://.../<file> → file://<cacheDir>/gl_asset_remote_<file>
const PRELOAD_URLS: string[] = [
  'https://www.baidu.com/img/PCtm_d9c8750bed0b3c7d089fa7d55720d6cf.png',
];

function writeCacheFile(cacheDir: string, path: string, bytes: Uint8Array): void {
  const file: fs.File = fs.openSync(
    path,
    fs.OpenMode.READ_WRITE | fs.OpenMode.CREATE | fs.OpenMode.TRUNC
  );
  try {
    const whole: ArrayBuffer = bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength
    ) as ArrayBuffer;
    fs.writeSync(file.fd, whole);
  } finally {
    fs.closeSync(file);
  }
}

// 尽力而为：把 demo 纹理资源落成 cacheDir 下确定性名字的文件，失败只记日志
function preloadDemoAssets(cacheDir: string, rm: resourceManager.ResourceManager): void {
  console.error(`[AssetPreload] cacheDir=${cacheDir}`);
  for (let i = 0; i < PRELOAD_RAWFILES.length; i++) {
    const name = PRELOAD_RAWFILES[i];
    const path = `${cacheDir}/gl_asset_${name.split('/').join('_')}`;
    rm.getRawFileContent(name)
      .then((bytes: Uint8Array) => {
        writeCacheFile(cacheDir, path, bytes);
        console.error(`[AssetPreload] wrote ${path} (${bytes.length} bytes)`);
      })
      .catch((error: BusinessError) => {
        console.error(`[AssetPreload] rawfile ${name} failed: ${JSON.stringify(error.message)}`);
      });
  }
  for (let i = 0; i < PRELOAD_URLS.length; i++) {
    const url = PRELOAD_URLS[i];
    const lastSlash = url.lastIndexOf('/');
    const fileName = lastSlash >= 0 ? url.slice(lastSlash + 1) : url;
    const httpRequest = http.createHttp();
    const options: http.HttpRequestOptions = {
      method: http.RequestMethod.GET,
      expectDataType: http.HttpDataType.ARRAY_BUFFER,
      connectTimeout: 15000,
      readTimeout: 30000
    };
    httpRequest.request(url, options)
      .then((resp: http.HttpResponse) => {
        if (resp.responseCode >= 200 && resp.responseCode < 300) {
          const data = resp.result as ArrayBuffer;
          writeCacheFile(cacheDir, `${cacheDir}/gl_asset_remote_${fileName}`, new Uint8Array(data));
        } else {
          console.error(`[AssetPreload] ${url} HTTP ${resp.responseCode}`);
        }
        httpRequest.destroy();
      })
      .catch((error: BusinessError) => {
        console.error(`[AssetPreload] ${url} failed: ${JSON.stringify(error.message)}`);
        httpRequest.destroy();
      });
  }
}

@Builder
export function buildCustomRNComponent(ctx: ComponentBuilderContext) {
// GEN:FABRIC_BUILDER_BODY_BEGIN
  Stack() {
    if (ctx.componentName === ExpoGLView.NAME) {
      ExpoGLView({
        ctx: ctx.rnComponentContext,
        tag: ctx.tag
      })
    }
  }
  .position({ x: 0, y: 0 })
// GEN:FABRIC_BUILDER_BODY_END
}

const wrappedCustomRNComponentBuilder = wrapBuilder(buildCustomRNComponent)

@Entry
@Component
struct Index {
  @StorageLink('RNOHCoreContext') private rnohCoreContext: RNOHCoreContext | undefined = undefined
  @State shouldShow: boolean = false
  private logger!: RNOHLogger

  aboutToAppear() {
    this.logger = this.rnohCoreContext!.logger.clone("Index")
    const stopTracing = this.logger.clone("aboutToAppear").startTracing();

    this.shouldShow = true
    // demo 纹理资源预落地（rawfile/远程图 → cacheDir 下确定性文件名）
    preloadDemoAssets(this.rnohCoreContext!.uiAbilityContext.cacheDir,
      this.rnohCoreContext!.uiAbilityContext.resourceManager)
    stopTracing();
  }

  onBackPress(): boolean | undefined {
    // NOTE: this is required since `Ability`'s `onBackPressed` function always
    // terminates or puts the app in the background, but we want Ark to ignore it completely
    // when handled by RN
    this.rnohCoreContext!.dispatchBackPress()
    return true
  }

  build() {
    Column() {
      if (this.rnohCoreContext && this.shouldShow) {
        if (this.rnohCoreContext?.isDebugModeEnabled) {
          RNOHErrorDialog({ ctx: this.rnohCoreContext })
        }
        RNApp({
          rnInstanceConfig: {
            createRNPackages,
            enableNDKTextMeasuring: true,
            enableBackgroundExecutor: false,
            enableCAPIArchitecture: true,
            arkTsComponentNames: [ExpoGLView.NAME]
          },
          initialProps: { "foo": "bar" } as Record<string, string>,
          appKey: "AwesomeProject",
          wrappedCustomRNComponentBuilder: wrappedCustomRNComponentBuilder,
          onSetUp: (rnInstance) => {
            rnInstance.enableFeatureFlag("ENABLE_RN_INSTANCE_CLEAN_UP")
          },
          jsBundleProvider: new TraceJSBundleProviderDecorator(
            new AnyJSBundleProvider([
              new MetroJSBundleProvider(),
              // NOTE: to load the bundle from file, place it in
              // `/data/app/el2/100/base/com.rnoh.tester/files/bundle.harmony.js`
              // on your device. The path mismatch is due to app sandboxing on OpenHarmony
              new FileJSBundleProvider('/data/storage/el2/base/files/bundle.harmony.js'),
              new ResourceJSBundleProvider(this.rnohCoreContext.uiAbilityContext.resourceManager, 'hermes_bundle.hbc'),
              new ResourceJSBundleProvider(this.rnohCoreContext.uiAbilityContext.resourceManager, 'bundle.harmony.js')
            ]),
            this.rnohCoreContext.logger),
        })
      }
    }
    .height('100%')
    .width('100%')
  }
}
