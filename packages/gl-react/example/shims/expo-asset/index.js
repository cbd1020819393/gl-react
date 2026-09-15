/**
 * MIT License
 *
 * Copyright (C) 2026 Huawei Device Co., Ltd.
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

/**
 * expo-asset shim for HarmonyOS (RNOH) — gl-react 纹理加载用。
 *
 * 链路：ExpoModuleTextureLoader 把 require('./x.png') / {uri} 交给本 shim
 * 解析成 {localUri, width, height}，再交给 @oh-rn/expo-gl 原生 texImage2D
 * （原生只认 localUri === "file://<沙箱路径>"，stb_image 解码，宽高以解码
 * 结果为准）。
 *
 * RN 打包资源在 RNOH 里是 asset:// 方案（ArkUI $rawfile 引用，非文件路径），
 * 远程图需要 http 下载 —— 两者由 Index.ets aboutToAppear 时预落地成
 * cacheDir 下确定性名字的文件，本 shim 只做确定性路径映射：
 *   asset://assets/img1.png        → <cacheDir>/gl_asset_assets_img1.png
 *   https://host/dir/iPKTONG.jpg   → <cacheDir>/gl_asset_remote_iPKTONG.jpg
 */
const {Image} = require('react-native');

// entry HAP 的标准沙箱 cacheDir（stage 模型固定形式）
const CACHE_DIR = '/data/storage/el2/base/haps/entry/cache';

function toFileUri(uri) {
  if (typeof uri !== 'string' || uri.length === 0) {
    return null;
  }
  if (uri.startsWith('file://')) {
    return uri;
  }
  if (uri.startsWith('/')) {
    return 'file://' + uri;
  }
  return null;
}

// asset:// 与 http(s):// 映射到 Index.ets 预落地的缓存文件
// asset:// 与 http(s):// 映射到 Index.ets 预落地的缓存文件（原生要求 file:// 前缀）。
// 注意 Index.ets 侧 rawfile 名带 RNOH assetsDest 前缀："assets/" + <uri path>，
// 因此缓存文件名是 gl_asset_assets_assets_<file>（双 assets）。
const ASSETS_DEST = 'assets/';

function resolveToLocalFile(uri) {
  if (typeof uri !== 'string' || uri.length === 0) {
    return null;
  }
  if (uri.startsWith('asset://')) {
    const rawfileName = ASSETS_DEST + uri.slice('asset://'.length);
    return (
      'file://' + CACHE_DIR + '/gl_asset_' +
      rawfileName.split('/').join('_')
    );
  }
  if (uri.startsWith('http://') || uri.startsWith('https://')) {
    const fileName = uri.slice(uri.lastIndexOf('/') + 1);
    return 'file://' + CACHE_DIR + '/gl_asset_remote_' + fileName;
  }
  return toFileUri(uri);
}

class Asset {
  constructor(init = {}) {
    this.localUri = init.localUri ?? null;
    this.uri = init.uri ?? null;
    this.width = init.width ?? 0;
    this.height = init.height ?? 0;
    this.__moduleUri = init.__moduleUri ?? null;
  }

  async downloadAsync() {
    if (this.localUri) {
      return this;
    }
    const uri = this.__moduleUri || this.uri || '';
    const localUri = resolveToLocalFile(uri);
    if (localUri) {
      this.localUri = localUri;
      console.info('[expo-asset shim] ' + uri + ' -> ' + localUri);
    } else {
      console.info('[expo-asset shim] cannot resolve ' + uri);
    }
    return this;
  }

  static fromModule(module) {
    try {
      const src = Image.resolveAssetSource(module);
      console.info(
        '[expo-asset shim] resolveAssetSource uri=' +
          JSON.stringify(src && src.uri),
      );
      if (src && typeof src.uri === 'string' && src.uri.length > 0) {
        return new Asset({
          localUri: toFileUri(src.uri),
          uri: src.uri,
          width: src.width,
          height: src.height,
          __moduleUri: src.uri,
        });
      }
    } catch (e) {
      console.info('[expo-asset shim] fromModule failed: ' + String(e));
    }
    return new Asset();
  }

  static fromURI(uri) {
    return new Asset({
      localUri: toFileUri(uri),
      uri,
      __moduleUri: uri,
    });
  }

  // 注意：上游 expo-asset 的 loadAsync 返回 Asset 数组
  // （webgltexture-loader-expo 里是 `const [asset] = await Asset.loadAsync(...)`）
  static async loadAsync(uriOrModule) {
    if (typeof uriOrModule === 'number') {
      const byModule = Asset.fromModule(uriOrModule);
      await byModule.downloadAsync();
      return [byModule];
    }
    const uri =
      typeof uriOrModule === 'string'
        ? uriOrModule
        : uriOrModule && typeof uriOrModule.uri === 'string'
        ? uriOrModule.uri
        : '';
    const byUri = Asset.fromURI(uri);
    await byUri.downloadAsync();
    return [byUri];
  }
}

module.exports = {Asset};
