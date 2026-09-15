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
 * gl-react @ HarmonyOS Demo（expo-gl 路径）
 *
 * 架构：gl-react(纯 JS) → gl-react-expo(官方绑定) → @oh-rn/expo-gl(原生 GL 能力) → GLES
 * 交互：首页用例列表 → 点进单用例全屏，同屏仅 1 个 Surface，规避多 surface 并发渲染问题。
 * 覆盖 gl-react 核心 API：Shaders/GLSL/Node/uniform（标量、数组、多 vec）、
 * connectSize、LinearCopy/NearestCopy、Bus、Uniform.Resolution/textureSizeRatio、
 * backbuffering+Uniform.Backbuffer、blendFunc/clear、快照导出（依绑定能力，失败有提示）。
 */
import React, {useCallback, useRef, useState} from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  Image,
  View,
} from 'react-native';
import {Surface} from 'gl-react-expo';
import {
  Node,
  Shaders,
  GLSL,
  Uniform,
  LinearCopy,
  NearestCopy,
  connectSize,
} from 'gl-react';
import {BusComparisonDemo} from './demos/bus';
import {CopyCompareDemo, TilingDemo} from './demos/sampling';
import {ResolutionGridDemo, AspectFitDemo} from './demos/special-uniforms';
import {BlendClearDemo} from './demos/blend-clear';

const img1 = require('./assets/img1.png');
const mario = require('./assets/mario.png');

// ---------------------------------------------------------------- 着色器

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
  colorDisc: {
    frag: GLSL`
precision highp float;
varying vec2 uv;
uniform vec3 fromColor, toColor;
void main() {
  float d = 2.0 * distance(uv, vec2(0.5));
  gl_FragColor = mix(
    vec4(mix(fromColor, toColor, d), 1.0),
    vec4(0.0),
    step(1.0, d)
  );
}`,
  },
  gradients: {
    frag: GLSL`
precision highp float;
varying vec2 uv;
uniform vec4 colors[3];
uniform vec2 particles[3];
void main () {
  vec4 sum = vec4(0.0);
  for (int i=0; i<3; i++) {
    vec4 c = colors[i];
    vec2 p = particles[i];
    float d = c.a * smoothstep(0.6, 0.2, distance(p, uv));
    sum += d * vec4(c.a * c.rgb, c.a);
  }
  if (sum.a > 1.0) {
    sum.rgb /= sum.a;
    sum.a = 1.0;
  }
  gl_FragColor = vec4(sum.a * sum.rgb, 1.0);
}`,
  },
  blur1D: {
    frag: GLSL`
precision highp float;
varying vec2 uv;
uniform sampler2D t;
uniform vec2 direction, resolution;
vec4 blur9(sampler2D image, vec2 uv, vec2 resolution, vec2 direction) {
  vec4 color = vec4(0.0);
  vec2 off1 = vec2(1.3846153846) * direction;
  vec2 off2 = vec2(3.2307692308) * direction;
  color += texture2D(image, uv) * 0.2270270270;
  color += texture2D(image, uv + (off1 / resolution)) * 0.3162162162;
  color += texture2D(image, uv - (off1 / resolution)) * 0.3162162162;
  color += texture2D(image, uv + (off2 / resolution)) * 0.0702702703;
  color += texture2D(image, uv - (off2 / resolution)) * 0.0702702703;
  return color;
}
void main() {
  gl_FragColor = blur9(t, uv, resolution, direction);
}`,
  },
  initGameOfLife: {
    frag: GLSL`
precision highp float;
varying vec2 uv;
float random (vec2 uv) {
  return fract(sin(dot(uv, vec2(12.9898,78.233))) * 43758.5453);
}
void main() {
  gl_FragColor = vec4(vec3(step(0.5, random(uv))), 1.0);
}`,
  },
  gameOfLife: {
    frag: GLSL`
precision highp float;
varying vec2 uv;
uniform float size;
uniform sampler2D t;
void main() {
  float prev = step(0.5, texture2D(t, uv).r);
  float c = 1.0 / size;
  float sum =
  step(0.5, texture2D(t, uv + vec2(-1.0, -1.0)*c).r) +
  step(0.5, texture2D(t, uv + vec2(-1.0,  0.0)*c).r) +
  step(0.5, texture2D(t, uv + vec2(-1.0,  1.0)*c).r) +
  step(0.5, texture2D(t, uv + vec2( 0.0,  1.0)*c).r) +
  step(0.5, texture2D(t, uv + vec2( 1.0,  1.0)*c).r) +
  step(0.5, texture2D(t, uv + vec2( 1.0,  0.0)*c).r) +
  step(0.5, texture2D(t, uv + vec2( 1.0, -1.0)*c).r) +
  step(0.5, texture2D(t, uv + vec2( 0.0, -1.0)*c).r);
  float next = prev==1.0 && sum >= 2.0 && sum <= 3.0 || sum == 3.0 ? 1.0 : 0.0;
  gl_FragColor = vec4(vec3(next), 1.0);
}`,
  },
});

const HelloGL = ({blue}: {blue: number}) => (
  <Node shader={shaders.helloBlue} uniforms={{blue}} />
);

const ColorDisc = ({
  fromColor,
  toColor,
}: {
  fromColor: number[];
  toColor: number[];
}) => (
  <Node
    shader={shaders.colorDisc}
    uniforms={{fromColor, toColor}}
  />
);

const Blur1D = connectSize(
  ({children: t, direction, width, height}: any) => (
    <Node
      shader={shaders.blur1D}
      uniforms={{t, resolution: [width, height], direction}}
    />
  ),
) as unknown as React.ComponentType<any>;

const BlurXY = connectSize(({factor, children}: any) => (
  <Blur1D direction={[factor, 0]}>
    <Blur1D direction={[0, factor]}>{children}</Blur1D>
  </Blur1D>
)) as unknown as React.ComponentType<any>;

const golRefreshEveryTicks = 20;

const GameOfLife = ({tick}: {tick: number}) => {
  const size = 16 * (1 + Math.floor(tick / golRefreshEveryTicks));
  return tick % golRefreshEveryTicks === 0 ? (
    <Node
      shader={shaders.initGameOfLife}
      width={size}
      height={size}
      backbuffering
      sync
    />
  ) : (
    <Node
      shader={shaders.gameOfLife}
      width={size}
      height={size}
      backbuffering
      sync
      uniforms={{t: Uniform.Backbuffer, size}}
    />
  );
};

function useTimeLoop(refreshRate = 60) {
  const [state, setState] = useState({time: 0, tick: 0});
  React.useEffect(() => {
    let raf: number | null = null;
    let startTime: number | undefined;
    let lastTime = -(1000 / refreshRate);
    const interval = 1000 / refreshRate;
    const loop = (t: number) => {
      raf = requestAnimationFrame(loop);
      if (startTime === undefined) {
        startTime = t;
      }
      if (t - lastTime > interval) {
        lastTime = t;
        setState(prev => ({time: t - startTime!, tick: prev.tick + 1}));
      }
    };
    raf = requestAnimationFrame(loop);
    return () => {
      if (raf != null) {
        cancelAnimationFrame(raf);
      }
    };
  }, [refreshRate]);
  return state;
}

// ---------------------------------------------------------------- 用例实现

function HelloBlueCase() {
  const [blue, setBlue] = useState(0.8);
  return (
    <>
      <Surface style={styles.surface}>
        <HelloGL blue={blue} />
      </Surface>
      <Text style={styles.sliderLabel}>blue = {blue.toFixed(2)}</Text>
      <View style={styles.buttonRow}>
        {[0.1, 0.5, 1.0].map(v => (
          <Text key={v} onPress={() => setBlue(v)} style={styles.button}>
            {v}
          </Text>
        ))}
      </View>
    </>
  );
}

function HelloBlueAnimCase({time}: {time: number}) {
  return (
    <Surface style={styles.surface}>
      <HelloGL blue={0.5 + 0.5 * Math.cos(time / 500)} />
    </Surface>
  );
}

function GradientsCase({time}: {time: number}) {
  return (
    <Surface style={styles.surface}>
      <Node
        shader={shaders.gradients}
        uniforms={{
          colors: [
            [Math.cos(0.002 * time), Math.sin(0.002 * time), 0.2, 1],
            [Math.sin(0.002 * time), -Math.cos(0.002 * time), 0.1, 1],
            [0.3, Math.sin(3 + 0.002 * time), Math.cos(1 + 0.003 * time), 1],
          ],
          particles: [
            [0.3, 0.3],
            [0.7, 0.5],
            [0.4, 0.9],
          ],
        }}
      />
    </Surface>
  );
}

function ColorDiscCase({time}: {time: number}) {
  return (
    <Surface style={styles.surface}>
      <ColorDisc
        fromColor={[1, 0, Math.abs(Math.cos(time / 1500))]}
        toColor={[0, 1, 0.4]}
      />
    </Surface>
  );
}

function BlurLocalCase() {
  const [blurFactor, setBlurFactor] = useState(2);
  return (
    <>
      <Surface style={styles.surfaceWide}>
        <BlurXY factor={blurFactor}>{img1}</BlurXY>
      </Surface>
      <View style={styles.buttonRow}>
        {[2, 6, 12, 24].map(f => (
          <Text
            key={f}
            onPress={() => setBlurFactor(f)}
            style={[styles.button, blurFactor === f && styles.buttonActive]}>
            x{f}
          </Text>
        ))}
      </View>
    </>
  );
}

function BlurHttpCase() {
  const [status, setStatus] = useState('纹理来源：{{uri}} 远程图（需网络）');
  return (
    <>
      <Surface
        style={styles.surfaceWide}
        onLoad={() => setStatus('onLoad：远程纹理已加载并上传')}>
        <BlurXY factor={0.008}>{{uri: 'https://www.baidu.com/img/PCtm_d9c8750bed0b3c7d089fa7d55720d6cf.png'}}</BlurXY>
      </Surface>
      <Text style={styles.statusText}>{status}</Text>
    </>
  );
}

function GameOfLifeCase({time}: {time: number}) {
  return (
    <Surface style={styles.surface}>
      <NearestCopy>
        <GameOfLife tick={time === 0 ? 0 : Math.floor(time / 33)} />
      </NearestCopy>
    </Surface>
  );
}

function SnapshotCase() {
  const surfaceRef = useRef<any>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [msg, setMsg] = useState('点按钮导出，结果将显示在这里');

  const withSurface = useCallback(
    async (fn: (s: any) => Promise<void> | void) => {
      const s: any = surfaceRef.current;
      if (!s) {
        setMsg('Surface 未挂载');
        return;
      }
      try {
        await fn(s);
      } catch (e: any) {
        setMsg('失败: ' + (e?.message || String(e)));
      }
    },
    [],
  );

  return (
    <>
      <Surface ref={surfaceRef} style={styles.surface}>
        <BlurXY factor={6}>{mario}</BlurXY>
      </Surface>
      <View style={styles.buttonRow}>
        <Text
          onPress={() =>
            withSurface(async s => {
              // gl-react-expo 的 GLView 仅实现 capture()（内部走
              // takeSnapshotAsync），不支持 gl-react-native 风格的
              // captureAsDataURL / captureAsBlob
              const glView = s.glView ?? s;
              const shot = await glView.capture({
                format: 'image/png',
                quality: 0.92,
              });
              const uri = shot && (shot.uri || shot.localUri);
              if (!uri) {
                throw new Error(
                  'snapshot returned no uri: ' +
                    JSON.stringify(shot).slice(0, 80),
                );
              }
              setPreview(uri);
              setMsg(
                `takeSnapshotAsync 成功 ${shot.width ?? '?'}x${shot.height ?? '?'}`,
              );
            })
          }
          style={styles.button}>
          takeSnapshotAsync
        </Text>
        <Text
          onPress={() =>
            withSurface(s => {
              const nd = s.capture();
              const {data, shape} = nd;
              const [h, w] = [shape[0], shape[1]];
              let r = 0;
              let g = 0;
              let b = 0;
              const n = h * w;
              for (let i = 0; i < n; i++) {
                r += data[i * 4];
                g += data[i * 4 + 1];
                b += data[i * 4 + 2];
              }
              setMsg(
                `capture() ${w}x${h} 平均色 rgb(${Math.round(r / n)},${Math.round(
                  g / n,
                )},${Math.round(b / n)})`,
              );
            })
          }
          style={styles.button}>
          capture() NDArray
        </Text>
      </View>
      <Text
        style={{
          marginTop: 8,
          fontSize: 13,
          fontWeight: '700',
          color:
            msg.startsWith('失败') || msg.startsWith('Surface') ? '#c00' : '#080',
        }}>
        {msg}
      </Text>
      {preview ? (
        <View style={{marginTop: 8, alignItems: 'center'}}>
          <Text style={styles.statusText}>快照预览：</Text>
          <Image source={{uri: preview}} style={styles.snapshotPreview} />
        </View>
      ) : null}
    </>
  );
}

function BusCase({time}: {time: number}) {
  return <BusComparisonDemo time={time} />;
}

function CopyCase() {
  return <CopyCompareDemo />;
}

function TilingCase() {
  return <TilingDemo />;
}

function ResolutionCase() {
  return (
    <>
      <ResolutionGridDemo />
      <View style={{height: 12}} />
      <AspectFitDemo />
    </>
  );
}

function BlendCase() {
  return <BlendClearDemo />;
}

// ---------------------------------------------------------------- 用例表

interface DemoCaseDef {
  key: string;
  title: string;
  desc: string;
  component: React.ComponentType<{time: number}>;
}

const CASES: DemoCaseDef[] = [
  {
    key: 'hello-blue',
    title: '1. HelloBlue（uniform 可调）',
    desc: '基础标量 uniform，按钮切换 blue 值',
    component: HelloBlueCase,
  },
  {
    key: 'hello-anim',
    title: '2. HelloBlueAnim（raf 动画）',
    desc: 'requestAnimationFrame 驱动 uniform',
    component: HelloBlueAnimCase,
  },
  {
    key: 'gradients',
    title: '3. Gradients（数组 uniform + raf）',
    desc: 'vec4[3] / vec2[3] 数组 uniform',
    component: GradientsCase,
  },
  {
    key: 'color-disc',
    title: '4. ColorDisc（多 vec3 uniform）',
    desc: '两个 vec3 uniform 渐变圆盘',
    component: ColorDiscCase,
  },
  {
    key: 'blur-local',
    title: '5. BlurXY（FBO 级联 + 本地纹理）',
    desc: 'connectSize + require 资源纹理，x1~x8 模糊',
    component: BlurLocalCase,
  },
  {
    key: 'blur-http',
    title: '6. BlurXY（远程 http 纹理）',
    desc: '{{uri}} 远程图纹理（需网络）',
    component: BlurHttpCase,
  },
  {
    key: 'gol',
    title: '7. GameOfLife（backbuffering）',
    desc: '离屏 FBO 乒乓读写 + Uniform.Backbuffer',
    component: GameOfLifeCase,
  },
  {
    key: 'snapshot',
    title: '8. 快照导出与像素读回',
    desc: 'captureAsDataURL / captureAsBlob / capture()（依绑定能力）',
    component: SnapshotCase,
  },
  {
    key: 'bus',
    title: '9. Bus（内容缓存复用）',
    desc: '同一子树渲染一次、多处采样',
    component: BusCase,
  },
  {
    key: 'copy',
    title: '10. LinearCopy vs NearestCopy',
    desc: '两种纹理采样方式对比',
    component: CopyCase,
  },
  {
    key: 'tiling',
    title: '11. uniformsOptions（wrap: repeat）',
    desc: '平铺采样',
    component: TilingCase,
  },
  {
    key: 'resolution',
    title: '12. Uniform.Resolution / textureSizeRatio',
    desc: '渲染目标尺寸注入 / 纹理宽高比 letterbox',
    component: ResolutionCase,
  },
  {
    key: 'blend',
    title: '13. blendFunc / clear',
    desc: 'Node 画进 FBO 的 GL 状态控制',
    component: BlendCase,
  },
];

// ---------------------------------------------------------------- 首页 / 详情

function App(): JSX.Element {
  const {time} = useTimeLoop(60);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const active = CASES.find(c => c.key === activeKey) || null;
  const ActiveComp = active?.component;

  if (active && ActiveComp) {
    return (
      <View style={{flex: 1, backgroundColor: '#f5f6fa'}}>
        <View style={styles.header}>
          <Text onPress={() => setActiveKey(null)} style={styles.backBtn}>
            ← 返回
          </Text>
          <Text style={styles.headerTitleFlex} numberOfLines={1}>
            {active.title}
          </Text>
        </View>
        <ScrollView contentContainerStyle={styles.container}>
          <Text style={styles.desc}>{active.desc}</Text>
          <ActiveComp time={time} />
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={{flex: 1, backgroundColor: '#f5f6fa'}}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>
          gl-react @ HarmonyOS（gl-react → gl-react-expo → expo-gl）
        </Text>
      </View>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.desc}>
          点进用例逐个验证 gl-react 功能（每次仅挂载 1 个 GL Surface）
        </Text>
        {CASES.map(c => (
          <Text
            key={c.key}
            onPress={() => setActiveKey(c.key)}
            style={styles.caseItem}>
            {c.title}
            {'\n'}
            <Text style={styles.caseDesc}>{c.desc}</Text>
          </Text>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingTop: 44,
    paddingBottom: 10,
    paddingHorizontal: 16,
    backgroundColor: '#2727ef',
    flexDirection: 'row',
    alignItems: 'center',
  },
  backBtn: {color: '#fff', fontSize: 15, paddingRight: 12},
  headerTitleFlex: {color: '#fff', fontSize: 15, fontWeight: '700', flex: 1},
  headerTitle: {color: '#fff', fontSize: 14, fontWeight: '700'},
  container: {padding: 12, paddingBottom: 48},
  desc: {fontSize: 12, color: '#666', marginBottom: 12},
  caseItem: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 14,
    marginBottom: 10,
    fontSize: 14,
    fontWeight: '700',
    color: '#222',
  },
  caseDesc: {fontSize: 12, fontWeight: '400', color: '#888'},
  surface: {width: 280, height: 280, alignSelf: 'center'},
  surfaceWide: {width: 300, height: 220, alignSelf: 'center'},
  snapshotPreview: {
    width: 140,
    height: 140,
    resizeMode: 'contain',
    marginTop: 4,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  buttonRow: {flexDirection: 'row', flexWrap: 'wrap', marginTop: 8},
  button: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginRight: 8,
    marginTop: 4,
    backgroundColor: '#2727ef',
    color: '#fff',
    borderRadius: 6,
    fontSize: 13,
    overflow: 'hidden',
  },
  buttonActive: {backgroundColor: '#e91e63'},
  sliderLabel: {
    fontSize: 12,
    color: '#444',
    marginTop: 6,
    textAlign: 'center',
  },
  statusText: {fontSize: 12, color: '#666', marginTop: 4},
});

export default App;
