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
 * blendFunc / clear 演示 — Node 绘制到 FBO 时的 GL 状态控制。
 *
 * 每个 Node 绘制流程：clear（默认透明黑）清空渲染目标 → 按 blendFunc
 * （默认 src alpha / one minus src alpha）画全屏大三角。
 * 因此：
 *  - clear={{color}} 决定 alpha<1 片元透出的底色
 *  - blendFunc 决定片元如何与目标混合；{src:'one', dst:'zero'} = 完全无视 alpha
 *
 * 三个 Surface 用同一个带 alpha 渐变的圆 shader，仅差 clear/blendFunc：
 *  A. 默认 blendFunc + 蓝色 clear → 柔和半透明圆叠在蓝底上
 *  B. 默认 blendFunc + 红色 clear → 同样圆叠在红底上（clear 生效对比）
 *  C. blendFunc {one, zero} → alpha 被忽略，整屏输出 rgb（圆不存在了）
 */
import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {Surface} from 'gl-react-expo';
import {Node, Shaders, GLSL} from 'gl-react';

const shaders = Shaders.create({
  softDisc: {
    frag: GLSL`
precision highp float;
varying vec2 uv;
uniform vec3 color;
void main() {
  float a = smoothstep(0.5, 0.2, distance(uv, vec2(0.5)));
  gl_FragColor = vec4(color, a);
}`,
  },
});

export function BlendClearDemo() {
  return (
    <View style={styles.row}>
      <View style={styles.cell}>
        <Surface style={styles.surfaceSmall}>
          <Node
            shader={shaders.softDisc}
            uniforms={{color: [1, 0.8, 0.2]}}
            clear={{color: [0, 0.2, 0.45, 1]}}
          />
        </Surface>
        <Text style={styles.caption}>默认 blend + clear 蓝底</Text>
      </View>
      <View style={styles.cell}>
        <Surface style={styles.surfaceSmall}>
          <Node
            shader={shaders.softDisc}
            uniforms={{color: [1, 0.8, 0.2]}}
            clear={{color: [0.75, 0.1, 0.15, 1]}}
          />
        </Surface>
        <Text style={styles.caption}>默认 blend + clear 红底</Text>
      </View>
      <View style={styles.cell}>
        <Surface style={styles.surfaceSmall}>
          <Node
            shader={shaders.softDisc}
            uniforms={{color: [1, 0.8, 0.2]}}
            clear={{color: [0, 0.2, 0.45, 1]}}
            blendFunc={{src: 'one', dst: 'zero'}}
          />
        </Surface>
        <Text style={styles.caption}>blendFunc one/zero（无视 alpha）</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  surfaceSmall: {width: 120, height: 120, borderWidth: 1, borderColor: '#eee'},
  row: {flexDirection: 'row', justifyContent: 'space-around'},
  cell: {alignItems: 'center', maxWidth: 110},
  caption: {fontSize: 11, color: '#555', marginTop: 4, textAlign: 'center'},
});
