/**
 * This source code is licensed under the MIT license found in the
 * LICENSE-MIT file in the root directory of this source tree.
 */

const path = require('path');
const {mergeConfig, getDefaultConfig} = require('@react-native/metro-config');
const {createHarmonyMetroConfig} = require('@react-native-oh/react-native-harmony/metro.config');

const harmonyConfig = createHarmonyMetroConfig({
  reactNativeHarmonyPackageName: '@react-native-oh/react-native-harmony',
});
// harmony-cli 的 resolver 里实现了第三方包重定向（expo-gl → @oh-rn/expo-gl、
// react-native → @react-native-oh/... 等），必须保留。
const harmonyResolveRequest =
  harmonyConfig.resolver && harmonyConfig.resolver.resolveRequest;

/**
 * @type {import("metro-config").ConfigT}
 */
const config = {
  transformer: {
    getTransformOptions: async () => ({
      transform: {
        experimentalImportSupport: false,
        inlineRequires: true,
      },
    }),
  },
  resolver: {
    // gl-react 的纹理加载器（webgltexture-loader-expo）引用 expo-asset /
    // expo-modules-core，本 Demo 不使用该路径，用本地 shim 提供最小 API 形状
    // （同 expo-gl example 的做法，见 shims/ 目录内注释）。
    extraNodeModules: {
      'expo-asset': path.resolve(__dirname, 'shims', 'expo-asset'),
      'expo-modules-core': path.resolve(__dirname, 'shims', 'expo-modules-core'),
    },
    resolveRequest: (context, moduleName, platform) => {
      // gl-react → 主包核心 shim：npm 原版 6.0.0 的 blendFunc 守卫
      // `if (src && dst)` 把合法的 gl.ZERO(=0) 当 falsy 跳过，one/zero 永不
      // 生效；主包 src 已包含修复，shims/gl-react 仅 re-export 核心部分
      // （不含 react-native 绑定与 OHOS 纹理 loader），并使 demos、
      // gl-react-expo 与 @react-native-ohos/gl-react 共享同一份核心模块实例。
      if (moduleName === 'gl-react') {
        return {
          type: 'sourceFile',
          filePath: path.resolve(__dirname, 'shims', 'gl-react', 'index.js'),
        };
      }
      if (harmonyResolveRequest) {
        return harmonyResolveRequest(context, moduleName, platform);
      }
      return context.resolveRequest(context, moduleName, platform);
    },
  },
};

module.exports = mergeConfig(
  getDefaultConfig(__dirname),
  harmonyConfig,
  config
);
