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

module.exports = {
  testEnvironment: 'node',
  rootDir: __dirname,
  // RN 内部代码检查 __DEV__ 全局变量
  globals: {
    __DEV__: true,
  },
  setupFiles: ['<rootDir>/jest.setup.js'],
  testMatch: ['<rootDir>/__tests__/*-test.js'],
  transform: {
    '^.+\\.(t|j)sx?$': [
      'babel-jest',
      {
        // 隔离：不查找/不合并外部 babel 配置（仓库根的上游 babel.config.js 不参与）
        configFile: false,
        babelrc: false,
        presets: [
          ['@babel/preset-env', {targets: {node: 'current'}, modules: 'commonjs'}],
          '@babel/preset-react',
          '@babel/preset-typescript',
        ],
      },
    ],
  },
  // 允许转译 node_modules 中的 react/react-native 包（如被间接引用）
  transformIgnorePatterns: ['node_modules/(?!react-native|@react-native|react)'],
  collectCoverageFrom: [
    '../src/GLSL.ts',
    '../src/genId.ts',
    '../src/Shaders.ts',
    '../src/Uniform.ts',
    '../src/Visitor.ts',
    '../src/Visitors.ts',
    '../src/VisitorLogger.ts',
    // copyShader.ts 是纯 `export default <表达式>` 文件：istanbul 对此类文件
    // 不生成 statementMap（插桩盲区，恒报 0%）。其行为已由 copyShader-test.js 验证。
    // '../src/copyShader.ts',
    '../src/webgl1-constants.ts',
    '../src/WebGLRenderingContextOHOS.ts',
    '../src/helpers/invariantNoDependentsLoop.ts',
  ],
  coverageThreshold: {
    global: {branches: 60},
  },
};
