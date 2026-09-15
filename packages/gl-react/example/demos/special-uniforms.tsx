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
 * 特殊 uniform 值演示 — Uniform 对象提供的"元数据注入"。
 *
 *  - Uniform.Resolution：注入 Node 渲染目标尺寸 [width, height]（vec2）
 *  - Uniform.textureSize(obj)：注入纹理尺寸 [w, h]（vec2）
 *  - Uniform.textureSizeRatio(obj)：注入纹理宽高比 w/h（float）
 *  - Uniform.backbufferFrom(node)：引用另一 Node 的上一帧输出（需对方 backbuffering）
 *    （GameOfLife 一节已演示 Uniform.Backbuffer 自引用）
 *
 * 本例演示前三个：
 *  1. Resolution：用实际像素尺寸画棋盘格（不依赖手动传宽高）
 *  2. textureSizeRatio：按纹理宽高比在正方形 Surface 内做等比 letterbox
 */
import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {Surface} from 'gl-react-expo';
import {Node, Shaders, GLSL, Uniform} from 'gl-react';

const mario = require('../assets/mario.png');

const shaders = Shaders.create({
  grid: {
    frag: GLSL`
precision highp float;
varying vec2 uv;
uniform vec2 resolution;
void main() {
  vec2 grid = floor(uv * resolution / 24.0);
  float v = mod(grid.x + grid.y, 2.0);
  gl_FragColor = vec4(vec3(0.16 + 0.72 * v, 0.17 + 0.7 * v, 0.2 + 0.65 * v), 1.0);
}`,
  },
  aspectFit: {
    frag: GLSL`
precision highp float;
varying vec2 uv;
uniform sampler2D tex;
uniform float sizeRatio;
void main() {
  vec2 p = uv - 0.5;
  if (sizeRatio > 1.0) {
    p.y = p.y * sizeRatio;   // 纹理偏宽：上下 letterbox
  } else {
    p.x = p.x / sizeRatio;   // 纹理偏高：左右 pillarbox
  }
  vec2 tuv = p + 0.5;
  float inside = step(0.0, tuv.x) * step(tuv.x, 1.0)
               * step(0.0, tuv.y) * step(tuv.y, 1.0);
  vec4 c = texture2D(tex, clamp(tuv, 0.0, 1.0));
  gl_FragColor = vec4(mix(vec3(0.07, 0.08, 0.11), c.rgb, inside), 1.0);
}`,
  },
});

export function ResolutionGridDemo() {
  return (
    <View>
      <Surface style={styles.surface}>
        <Node shader={shaders.grid} uniforms={{resolution: Uniform.Resolution}} />
      </Surface>
      <Text style={styles.note}>
        resolution 由 Uniform.Resolution 自动注入（= Surface 像素尺寸），
        改 Surface 尺寸格子大小不变
      </Text>
    </View>
  );
}

export function AspectFitDemo() {
  return (
    <View>
      <Surface style={styles.surface}>
        <Node
          shader={shaders.aspectFit}
          uniforms={{
            tex: mario,
            sizeRatio: Uniform.textureSizeRatio(mario),
          }}
        />
      </Surface>
      <Text style={styles.note}>
        sizeRatio 由 Uniform.textureSizeRatio 注入（= 纹理宽/高），
        等比缩放 + letterbox，不拉伸
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  surface: {width: 280, height: 280, alignSelf: 'center'},
  note: {fontSize: 12, color: '#666', marginTop: 4},
  row: {flexDirection: 'row', justifyContent: 'center'},
});
