import { Component, lazy, Suspense, useMemo, type ReactNode } from 'react';
import type { SceneStage } from '@/scenes/SieveScene';

const SieveCanvas = lazy(() => import('@/scenes/SieveCanvas'));

export function webglAvailable(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return Boolean(canvas.getContext('webgl2') ?? canvas.getContext('webgl'));
  } catch {
    return false;
  }
}

/** Static stand-in: used while the 3D chunk loads, without WebGL, and if the scene throws. */
export function SieveSvg({ className = '' }: { className?: string }) {
  const holes: Array<[number, number]> = [];
  for (let row = -4; row <= 4; row += 1) {
    for (let col = -5; col <= 5; col += 1) {
      const x = 200 + col * 26 + (row % 2 ? 13 : 0);
      const y = 150 + row * 22.5;
      if (Math.hypot(x - 200, (y - 150) * 1.15) < 128) holes.push([x, y]);
    }
  }
  return (
    <svg viewBox="0 0 400 300" className={className} aria-hidden focusable="false" preserveAspectRatio="xMidYMid meet">
      <ellipse cx="200" cy="150" rx="150" ry="52" fill="none" stroke="rgb(var(--accent))" strokeWidth="3" />
      {holes.map(([x, y]) => (
        <ellipse key={`${x}-${y}`} cx={x} cy={150 + (y - 150) * 0.38} rx="4.6" ry="1.7" fill="rgb(var(--accent))" opacity=".75" />
      ))}
      <g fill="rgb(var(--accent-2))">
        <circle cx="160" cy="40" r="4" />
        <circle cx="230" cy="62" r="4" />
        <circle cx="270" cy="22" r="3" opacity=".7" />
      </g>
      <g fill="rgb(var(--accent))">
        <circle cx="180" cy="230" r="4" />
        <circle cx="215" cy="256" r="3.4" opacity=".7" />
        <circle cx="200" cy="280" r="2.6" opacity=".45" />
      </g>
      <g fill="rgb(var(--danger))" opacity=".8">
        <circle cx="285" cy="118" r="3.4" />
        <circle cx="116" cy="106" r="3" opacity=".6" />
      </g>
    </svg>
  );
}

class SceneBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override componentDidCatch(error: Error) {
    console.warn('3D scene disabled:', error.message);
  }
  override render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/** The lazy, failure-proof 3D sieve. The page is fully usable before (and without) this loads. */
export function Hero3D({ stage = 'filter', className = '' }: { stage?: SceneStage; className?: string }) {
  const supported = useMemo(webglAvailable, []);
  const fallback = <SieveSvg className={className} />;
  if (!supported) return fallback;
  return (
    <SceneBoundary fallback={fallback}>
      <Suspense fallback={fallback}>
        <SieveCanvas stage={stage} className={className} />
      </Suspense>
    </SceneBoundary>
  );
}
