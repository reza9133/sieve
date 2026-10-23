import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { SceneTokens } from '@/theme/theme';

/**
 * One scene, several stages. The hero stays on `filter`; the how-it-works page walks through all
 * of them. Colours come from theme tokens (props, because R3F v8 does not bridge React context)
 * and are lerped every frame so a theme switch fades instead of snapping.
 */
export type SceneStage = 'idle' | 'sealed' | 'reveal' | 'filter' | 'ranking' | 'payout';

interface SceneProps {
  stage: SceneStage;
  tokens: SceneTokens;
  /** Number of bid particles. Callers scale this down on small / low-end devices. */
  count: number;
  /** Static render: no animation, no parallax. Used for prefers-reduced-motion. */
  reduced: boolean;
}

const RADIUS = 2.2;
const PLANE_Y = 0;
const FLOOR_Y = -2.6;

/** Deterministic pseudo-random so reduced-motion layouts are stable between renders. */
function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 100000) / 100000;
  };
}

function useThemeColors(tokens: SceneTokens) {
  const targets = useMemo(
    () => ({
      accent: new THREE.Color(tokens.accent),
      accent2: new THREE.Color(tokens.accent2),
      danger: new THREE.Color(tokens.danger),
      success: new THREE.Color(tokens.success),
      text: new THREE.Color(tokens.text),
    }),
    [tokens],
  );
  const current = useRef({
    accent: targets.accent.clone(),
    accent2: targets.accent2.clone(),
    danger: targets.danger.clone(),
    success: targets.success.clone(),
    text: targets.text.clone(),
    glow: tokens.glow,
  });
  const step = (rate: number) => {
    const c = current.current;
    c.accent.lerp(targets.accent, rate);
    c.accent2.lerp(targets.accent2, rate);
    c.danger.lerp(targets.danger, rate);
    c.success.lerp(targets.success, rate);
    c.text.lerp(targets.text, rate);
    c.glow += (tokens.glow - c.glow) * rate;
  };
  const snap = () => {
    const c = current.current;
    c.accent.copy(targets.accent);
    c.accent2.copy(targets.accent2);
    c.danger.copy(targets.danger);
    c.success.copy(targets.success);
    c.text.copy(targets.text);
    c.glow = tokens.glow;
  };
  return { current: current.current, step, snap };
}

/* ---------------------------------------------------------------- the sieve itself */

function holePositions(): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  const gap = 0.3;
  const rowH = gap * 0.866;
  for (let row = -9; row <= 9; row += 1) {
    for (let col = -9; col <= 9; col += 1) {
      const x = col * gap + (row % 2 ? gap / 2 : 0);
      const z = row * rowH;
      if (Math.hypot(x, z) < RADIUS - 0.18) out.push([x, z]);
    }
  }
  return out;
}

function Mesh({ colors, reduced }: { colors: ReturnType<typeof useThemeColors>; reduced: boolean }) {
  const holes = useMemo(holePositions, []);
  const instanced = useRef<THREE.InstancedMesh>(null);
  const rim = useRef<THREE.MeshBasicMaterial>(null);
  const holeMat = useRef<THREE.MeshBasicMaterial>(null);
  const plate = useRef<THREE.MeshBasicMaterial>(null);
  const geoms = useMemo(
    () => ({ hole: new THREE.RingGeometry(0.06, 0.105, 18), rim: new THREE.TorusGeometry(RADIUS, 0.05, 12, 120), plate: new THREE.CircleGeometry(RADIUS, 64) }),
    [],
  );
  useEffect(
    () => () => {
      geoms.hole.dispose();
      geoms.rim.dispose();
      geoms.plate.dispose();
    },
    [geoms],
  );
  useEffect(() => {
    const mesh = instanced.current;
    if (!mesh) return;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));
    holes.forEach(([x, z], i) => {
      m.compose(new THREE.Vector3(x, PLANE_Y, z), q, new THREE.Vector3(1, 1, 1));
      mesh.setMatrixAt(i, m);
    });
    mesh.instanceMatrix.needsUpdate = true;
  }, [holes]);

  const apply = () => {
    const c = colors.current;
    const glow = c.glow > 0.5;
    if (holeMat.current) {
      holeMat.current.color.copy(c.accent);
      holeMat.current.opacity = glow ? 0.9 : 0.75;
    }
    if (rim.current) rim.current.color.copy(c.accent);
    if (plate.current) {
      plate.current.color.copy(c.accent2);
      plate.current.opacity = glow ? 0.06 : 0.07;
    }
  };
  useFrame(() => {
    if (reduced) return;
    apply();
  });
  useEffect(apply);

  return (
    <group>
      <mesh geometry={geoms.plate} rotation={[-Math.PI / 2, 0, 0]} position={[0, PLANE_Y - 0.01, 0]}>
        <meshBasicMaterial ref={plate} transparent opacity={0.07} side={THREE.DoubleSide} depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh geometry={geoms.rim} rotation={[-Math.PI / 2, 0, 0]} position={[0, PLANE_Y, 0]}>
        <meshBasicMaterial ref={rim} toneMapped={false} />
      </mesh>
      <instancedMesh ref={instanced} args={[geoms.hole, undefined, holes.length]} frustumCulled={false}>
        <meshBasicMaterial ref={holeMat} transparent opacity={0.8} side={THREE.DoubleSide} depthWrite={false} toneMapped={false} />
      </instancedMesh>
    </group>
  );
}

/* ---------------------------------------------------------------- bid particles */

interface P {
  x: number;
  y: number;
  z: number;
  vy: number;
  pass: boolean;
  decided: boolean;
  life: number;
  seed: number;
}

function spawn(p: P, r: () => number, stagger: boolean) {
  const a = r() * Math.PI * 2;
  const d = Math.sqrt(r()) * (RADIUS - 0.3);
  p.x = Math.cos(a) * d;
  p.z = Math.sin(a) * d;
  p.y = stagger ? 0.4 + r() * 6 : 4 + r() * 2.5;
  p.vy = -(0.8 + r() * 0.6);
  p.pass = r() < 0.62;
  p.decided = false;
  p.life = 1;
}

function Particles({ stage, count, reduced, colors }: { stage: SceneStage; count: number; reduced: boolean; colors: ReturnType<typeof useThemeColors> }) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const mat = useRef<THREE.MeshBasicMaterial>(null);
  const geometry = useMemo(() => new THREE.SphereGeometry(0.075, 12, 12), []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  const random = useMemo(() => rng(7), []);
  const parts = useMemo<P[]>(() => Array.from({ length: count }, (_, i) => ({ x: 0, y: 0, z: 0, vy: 0, pass: true, decided: false, life: 1, seed: i })), [count]);
  const prevStage = useRef<SceneStage>(stage);
  const lastBlend = useRef<THREE.Blending>(THREE.NormalBlending);
  const tmp = useMemo(() => ({ m: new THREE.Matrix4(), v: new THREE.Vector3(), q: new THREE.Quaternion(), s: new THREE.Vector3(), c: new THREE.Color() }), []);
  const invalidate = useThree((s) => s.invalidate);

  useEffect(() => {
    const r = rng(11);
    parts.forEach((p) => spawn(p, r, true));
    if (reduced) {
      // A readable still frame: some above the mesh (not yet decided), some already below it.
      parts.forEach((p, i) => {
        if (i % 3 === 0) {
          p.y = 0.8 + r() * 2.2;
          p.decided = false;
        } else if (p.pass) {
          p.y = -0.3 - r() * 2;
          p.decided = true;
        } else {
          p.y = 0.2 + r() * 0.5;
          p.decided = true;
          p.life = 0.55;
        }
      });
    }
  }, [parts, reduced]);

  const write = (time: number, dt: number) => {
    const im = mesh.current;
    if (!im) return;
    const c = colors.current;
    const glow = c.glow > 0.5;
    const blending = glow ? THREE.AdditiveBlending : THREE.NormalBlending;
    if (mat.current && lastBlend.current !== blending) {
      mat.current.blending = blending;
      mat.current.needsUpdate = true;
      lastBlend.current = blending;
    }
    const filtering = stage === 'filter';
    parts.forEach((p, i) => {
      let scale = 1;
      let color = c.accent2;
      if (filtering) {
        if (!reduced) {
          p.y += p.vy * dt;
          if (!p.decided && p.y <= PLANE_Y + 0.05) {
            p.decided = true;
            if (!p.pass) p.vy = 1.15;
          }
          if (p.decided && !p.pass) {
            p.vy -= 3.2 * dt;
            p.life -= dt * 0.75;
          }
          if (p.decided && p.pass && p.y < FLOOR_Y) p.life -= dt * 2.5;
          if (p.life <= 0 || p.y > 7) spawn(p, random, false);
        }
        color = !p.decided ? c.accent2 : p.pass ? c.accent : c.danger;
        scale = Math.max(0.001, p.life);
        tmp.v.set(p.x, p.y, p.z);
      } else if (stage === 'sealed' || stage === 'reveal') {
        const K = Math.min(parts.length, 18);
        if (i >= K) {
          scale = 0.0001;
          tmp.v.set(0, 3, 0);
        } else {
          const a = (i / K) * Math.PI * 2 + (reduced ? 0 : time * 0.25);
          const target = tmp.v.set(Math.cos(a) * 1.5, 1.2 + (reduced ? 0 : Math.sin(time * 1.2 + i) * 0.06), Math.sin(a) * 1.5);
          p.x += (target.x - p.x) * 0.12;
          p.y += (target.y - p.y) * 0.12;
          p.z += (target.z - p.z) * 0.12;
          tmp.v.set(p.x, p.y, p.z);
          const open = stage === 'reveal';
          color = open ? c.accent : c.text;
          scale = open ? 1.5 + (reduced ? 0 : Math.sin(time * 3 + i) * 0.25) : 1.15;
        }
      } else if (stage === 'payout') {
        const K = Math.min(parts.length, 28);
        if (i >= K) {
          scale = 0.0001;
          tmp.v.set(0, 3, 0);
        } else {
          const u = reduced ? i / K : (time * 0.35 + i / K) % 1;
          p.x = u * 2.8;
          p.y = -0.2 - Math.sin(u * Math.PI) * -0.9 - u * 1.9;
          p.z = Math.sin(i) * 0.25;
          tmp.v.set(p.x, p.y, p.z);
          color = c.success;
          scale = 1.1;
        }
      } else {
        scale = 0.0001;
        tmp.v.set(0, 3, 0);
      }
      tmp.s.set(scale, scale, scale);
      tmp.m.compose(tmp.v, tmp.q, tmp.s);
      im.setMatrixAt(i, tmp.m);
      im.setColorAt(i, tmp.c.copy(color));
    });
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
  };

  useFrame((state, dt) => {
    if (reduced) return;
    // Entering the filter stage starts a fresh rain; leaving it parks the particles.
    if (prevStage.current !== stage) {
      if (stage === 'filter') parts.forEach((p) => spawn(p, random, true));
      prevStage.current = stage;
    }
    write(state.clock.elapsedTime, Math.min(dt, 0.05));
  });

  useEffect(() => {
    if (reduced) {
      colors.snap();
      write(0, 0);
      invalidate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduced, stage, count, colors]);

  return (
    <instancedMesh ref={mesh} args={[geometry, undefined, count]} frustumCulled={false}>
      <meshBasicMaterial ref={mat} transparent depthWrite={false} toneMapped={false} />
    </instancedMesh>
  );
}

/* ---------------------------------------------------------------- ranking bars + payout tray */

const BAR_TARGETS = [0.55, 0.85, 1.2, 1.6, 2.0]; // prices: the shortest bar is the lowest price and wins

function Bars({ stage, colors, reduced }: { stage: SceneStage; colors: ReturnType<typeof useThemeColors>; reduced: boolean }) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const geometry = useMemo(() => new THREE.BoxGeometry(0.34, 1, 0.34), []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  const heights = useRef(BAR_TARGETS.map(() => 0));
  const tmp = useMemo(() => ({ m: new THREE.Matrix4(), v: new THREE.Vector3(), q: new THREE.Quaternion(), s: new THREE.Vector3(), c: new THREE.Color() }), []);
  const invalidate = useThree((s) => s.invalidate);
  const write = (snap: boolean) => {
    const im = mesh.current;
    if (!im) return;
    const on = stage === 'ranking';
    BAR_TARGETS.forEach((h, i) => {
      const target = on ? h : 0.0001;
      heights.current[i] = snap ? target : (heights.current[i] ?? 0) + (target - (heights.current[i] ?? 0)) * 0.08;
      const height = Math.max(0.0001, heights.current[i] ?? 0);
      tmp.v.set(-0.9 + i * 0.45, -1.3 + height / 2, 1.9);
      tmp.s.set(1, height, 1);
      im.setMatrixAt(i, tmp.m.compose(tmp.v, tmp.q, tmp.s));
      im.setColorAt(i, tmp.c.copy(i === 0 ? colors.current.accent : colors.current.accent2));
    });
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
  };
  useFrame(() => {
    if (!reduced) write(false);
  });
  useEffect(() => {
    if (reduced) {
      write(true);
      invalidate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduced, stage, colors]);
  return (
    <instancedMesh ref={mesh} args={[geometry, undefined, BAR_TARGETS.length]} frustumCulled={false}>
      <meshBasicMaterial transparent opacity={0.9} toneMapped={false} />
    </instancedMesh>
  );
}

function Tray({ colors, stage, reduced }: { colors: ReturnType<typeof useThemeColors>; stage: SceneStage; reduced: boolean }) {
  const mat = useRef<THREE.MeshBasicMaterial>(null);
  const geometry = useMemo(() => new THREE.TorusGeometry(0.55, 0.035, 10, 64), []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  const apply = () => {
    if (!mat.current) return;
    mat.current.color.copy(stage === 'payout' ? colors.current.success : colors.current.accent);
    mat.current.opacity = stage === 'payout' || stage === 'filter' ? 0.85 : 0.2;
  };
  useFrame(() => {
    if (!reduced) apply();
  });
  useEffect(apply);
  return (
    <mesh geometry={geometry} rotation={[-Math.PI / 2, 0, 0]} position={[stage === 'payout' ? 2.8 : 0, stage === 'payout' ? -2.1 : FLOOR_Y, 0]}>
      <meshBasicMaterial ref={mat} transparent toneMapped={false} />
    </mesh>
  );
}

/* ---------------------------------------------------------------- the scene root */

export function SieveScene({ stage, tokens, count, reduced }: SceneProps) {
  const colors = useThemeColors(tokens);
  const group = useRef<THREE.Group>(null);
  const idle = useRef(0);

  useFrame((state, dt) => {
    colors.step(Math.min(1, dt * 4));
    const g = group.current;
    if (!g || reduced) return;
    idle.current += dt * 0.12;
    const px = state.pointer.x;
    const py = state.pointer.y;
    g.rotation.y += (px * 0.35 + Math.sin(idle.current) * 0.25 - g.rotation.y) * 0.05;
    g.rotation.x += (py * -0.08 + 0.1 - g.rotation.x) * 0.05;
  });

  return (
    <group ref={group} rotation={[0.1, 0, 0]}>
      <Mesh colors={colors} reduced={reduced} />
      <Particles stage={stage} count={count} reduced={reduced} colors={colors} />
      <Bars stage={stage} colors={colors} reduced={reduced} />
      <Tray colors={colors} stage={stage} reduced={reduced} />
    </group>
  );
}
