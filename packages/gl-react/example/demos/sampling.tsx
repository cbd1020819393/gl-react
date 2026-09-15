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
 * 纹理采样演示。
 *
 *  - LinearCopy / NearestCopy：拷贝包装器，控制内容缩放时的插值方式
 *    （双线性 = 平滑；最近邻 = 像素风）。用一张低分辨率像素图放大即可看出差别。
 *  - Node#uniformsOptions：按 uniform 指定纹理采样参数
 *    （wrap: 'clamp to edge' | 'repeat' | 'mirrored repeat'，
 *     interpolation: 'linear' | 'nearest'）。
 *    平铺 shader 采样 uv*3.0，依赖 wrap:'repeat' 才能正确越界回绕。
 */
import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {Surface} from 'gl-react-expo';
import {Node, Shaders, GLSL, LinearCopy, NearestCopy} from 'gl-react';

const mario = require('../assets/mario.png');

const shaders = Shaders.create({
  passthrough: {
    frag: GLSL`
precision highp float;
varying vec2 uv;
uniform sampler2D tex;
void main() {
  gl_FragColor = texture2D(tex, uv);
}`,
  },
  tiled: {
    // uv*3 越界部分由 GL_REPEAT 回绕采样（配合 uniformsOptions.wrap）
    frag: GLSL`
precision highp float;
varying vec2 uv;
uniform sampler2D tex;
void main() {
  gl_FragColor = texture2D(tex, uv * 3.0);
}`,
  },
});

export function CopyCompareDemo() {
  return (
    <View style={styles.row}>
      <View style={styles.cell}>
        <Surface style={styles.surfaceSmall}>
          <LinearCopy>{mario}</LinearCopy>
        </Surface>
        <Text style={styles.caption}>LinearCopy（线性插值）</Text>
      </View>
      <View style={styles.cell}>
        <Surface style={styles.surfaceSmall}>
          <NearestCopy>{mario}</NearestCopy>
        </Surface>
        <Text style={styles.caption}>NearestCopy（最近邻）</Text>
      </View>
    </View>
  );
}

export function TilingDemo() {
  return (
    <View>
      <Surface style={styles.surface}>
        <Node
          shader={shaders.tiled}
          uniforms={{tex: mario}}
          uniformsOptions={{
            tex: {wrap: 'repeat', interpolation: 'nearest'},
          }}
        />
      </Surface>
      <Text style={styles.note}>
        uniformsOptions={'{{tex: {wrap: "repeat", interpolation: "nearest"}}}'}
        ，shader 采样 uv*3.0 越界回绕成 3×3 平铺
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  surface: {width: 280, height: 280, alignSelf: 'center'},
  surfaceSmall: {width: 130, height: 130},
  row: {flexDirection: 'row', justifyContent: 'space-around'},
  cell: {alignItems: 'center'},
  caption: {fontSize: 12, color: '#555', marginTop: 4},
  note: {fontSize: 12, color: '#666', marginTop: 4},
});
