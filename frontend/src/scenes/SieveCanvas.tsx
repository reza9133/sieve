import { useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import { useReducedMotion } from 'framer-motion';
import { useOnScreen } from '@/hooks/useInView';
import { useSceneTokens } from '@/theme/theme';
import { SieveScene, type SceneStage } from './SieveScene';

/** Fewer particles on phones and low-core devices. */
export function adaptiveCount(): number {
  const small = window.innerWidth < 640;
  const cores = navigator.hardwareConcurrency ?? 4;
  if (small || cores <= 2) return 70;
  if (cores <= 4) return 120;
  return 190;
}

/**
 * The decorative 3D canvas. Rendering pauses when off screen or in a hidden tab; reduced motion
 * renders a single still frame. It is aria-hidden: everything it shows also exists as text.
 */
export default function SieveCanvas({ stage = 'filter', className = '' }: { stage?: SceneStage; className?: string }) {
  const wrapper = useRef<HTMLDivElement>(null);
  const visible = useOnScreen(wrapper);
  const reduced = useReducedMotion() ?? false;
  const tokens = useSceneTokens();
  return (
    <div ref={wrapper} className={className} aria-hidden>
      <Canvas
        frameloop={reduced ? 'demand' : visible ? 'always' : 'never'}
        dpr={[1, 2]}
        camera={{ position: [0, 2.6, 7.4], fov: 38 }}
        gl={{ alpha: true, antialias: true, powerPreference: 'default' }}
        onCreated={({ camera }) => camera.lookAt(0, -0.2, 0)}
        style={{ background: 'transparent' }}
      >
        <SieveScene stage={stage} tokens={tokens} count={adaptiveCount()} reduced={reduced} />
      </Canvas>
    </div>
  );
}
