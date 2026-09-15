/**
 * This source code is licensed under the MIT license found in the
 * LICENSE-MIT file in the root directory of this source tree.
 */

import { RNPackageContext, RNPackage } from '@rnoh/react-native-openharmony/ts';
import { createRNOHPackages as createRNOHPackagesAutolinking } from './RNOHPackagesFactory';
import { AssetFileBridgePackage } from './AssetFileBridgePackage';

// 手动注册导入示例（不支持autolink的插件）:
// import { YourPackage } from '@oh-rn/your-package/ts';

export function createRNPackages(ctx: RNPackageContext): RNPackage[] {
  return [
    // autolink支持（RNOHPackagesFactory.ets 为模板 stub，build hap 时 hvigor 覆盖）
    ...createRNOHPackagesAutolinking(ctx),

    // 纹理资源桥接：rawfile/远程 http → 沙箱缓存文件（file://）给 expo-gl 原生解码
    new AssetFileBridgePackage(ctx),

    // 手动注册示例（不支持autolink的插件）:
    // new YourPackage(ctx),
  ];
}
