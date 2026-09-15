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
 * Bus 演示 — gl-react 的内容缓存复用机制。
 *
 * Bus 把一个子树渲染成 FBO 纹理并"缓存"，同一帧内可被多个采样点复用，
 * 避免同样的子树被重复绘制。两种等价用法：
 *  1. 显式：<Node uniforms={{t: null}}><Bus uniform="t"><Node .../></Bus></Node>
 *  2. 隐式：把 React 元素直接作为 uniform 值传入，gl-react 会自动包一层 Bus
 *     （见 Node#_resolveElement：isValidElement(value) → createElement(Bus, ...)）
 *
 * 本例：split 节点左半采样 rings、右半采样 stripes，两个内容各自只渲染一次。
 */
import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {Surface} from 'gl-react-expo';
import {Node, Shaders, GLSL, Bus} from 'gl-react';

const shaders = Shaders.create({
  rings: {
    // 缓存内容 1：动画同心环
    frag: GLSL`
precision highp float;
varying vec2 uv;
uniform float time;
void main() {
  float d = distance(uv, vec2(0.5)) + 0.08 * sin(time / 300.0);
  float v = step(0.5, fract(d * 10.0));
  gl_FragColor = vec4(0.1 + v * 0.3, 0.4 + v * 0.6, 0.9, 1.0);
}`,
  },
  stripes: {
    // 缓存内容 2：滚动斜条纹
    frag: GLSL`
precision highp float;
varying vec2 uv;
uniform float time;
void main() {
  float v = step(0.5, fract((uv.x + uv.y) * 6.0 + time / 600.0));
  gl_FragColor = vec4(1.0 - v * 0.85, 0.25 + v * 0.3, v * 0.2, 1.0);
}`,
  },
  split: {
    // 消费节点：左半采样 rings、右半采样 stripes（两个 Bus 的纹理）
    frag: GLSL`
precision highp float;
varying vec2 uv;
uniform sampler2D rings;
uniform sampler2D stripes;
void main() {
  gl_FragColor = uv.x < 0.5
    ? texture2D(rings, vec2(uv.x * 2.0, uv.y))
    : texture2D(stripes, vec2((uv.x - 0.5) * 2.0, uv.y));
}`,
  },
});

/** 用法 1：显式 <Bus uniform="...">（作为 Node 的 children） */
export function BusExplicitDemo({time}: {time: number}) {
  return (
    <Surface style={styles.surface}>
      <Node shader={shaders.split} uniforms={{rings: null, stripes: null}}>
        <Bus uniform="rings">
          <Node shader={shaders.rings} uniforms={{time}} />
        </Bus>
        <Bus uniform="stripes">
          <Node shader={shaders.stripes} uniforms={{time}} />
        </Bus>
      </Node>
    </Surface>
  );
}

/** 用法 2：元素直接作为 uniform 值 → 自动包成 Bus（渲染结果与用法 1 一致） */
export function BusImplicitDemo({time}: {time: number}) {
  return (
    <Surface style={styles.surface}>
      <Node
        shader={shaders.split}
        uniforms={{
          rings: <Node shader={shaders.rings} uniforms={{time}} />,
          stripes: <Node shader={shaders.stripes} uniforms={{time}} />,
        }}
      />
    </Surface>
  );
}

const styles = StyleSheet.create({
  surface: {width: 280, height: 200, alignSelf: 'center'},
  note: {fontSize: 12, color: '#666', marginTop: 4},
  row: {flexDirection: 'row', justifyContent: 'center'},
});

export function BusComparisonDemo({time}: {time: number}) {
  return (
    <View>
      <BusExplicitDemo time={time} />
      <Text style={styles.note}>
        上：显式 {'<Bus uniform="rings">'}；下：元素作为 uniform 值（自动 Bus）
      </Text>
      <View style={styles.row}>
        <BusImplicitDemo time={time} />
      </View>
    </View>
  );
}
