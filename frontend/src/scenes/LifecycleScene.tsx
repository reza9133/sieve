import { useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useTheme } from '@/theme/ThemeProvider'

export type LifecycleStage =
  | 'open'
  | 'bidding'
  | 'reveal'
  | 'screening'
  | 'finalize'
  | 'withdraw'

interface LifecycleSceneProps {
  stage: LifecycleStage
}

function StageObjects({ stage }: { stage: LifecycleStage }) {
  const { theme } = useTheme()
  const groupRef = useRef<THREE.Group>(null)

  const accentColor = theme === 'light' ? '#6d28d9' : '#a78bfa'
  const successColor = theme === 'light' ? '#059669' : '#34d399'
  const dangerColor = theme === 'light' ? '#dc2626' : '#f87171'

  useFrame((_, delta) => {
    if (groupRef.current) {
      groupRef.current.rotation.y += delta * 0.3
    }
  })

  return (
    <group ref={groupRef}>
      {/* Central sieve disc present in all stages */}
      <mesh rotation={[-Math.PI / 4, 0, 0]}>
        <torusGeometry args={[2, 0.06, 16, 48]} />
        <meshStandardMaterial color={accentColor} metalness={0.7} />
      </mesh>

      {/* Stage-specific items */}
      {stage === 'open' && (
        // Open tender: glowing central contract escrow node
        <mesh position={[0, 0, 0]}>
          <octahedronGeometry args={[0.8]} />
          <meshStandardMaterial color={accentColor} emissive={accentColor} emissiveIntensity={0.5} wireframe />
        </mesh>
      )}

      {stage === 'bidding' && (
        // Sealed spheres orbiting around sieve
        <>
          {[-1.5, -0.5, 0.5, 1.5].map((x, i) => (
            <mesh key={i} position={[x, 1.2, 0]}>
              <sphereGeometry args={[0.25, 16, 16]} />
              <meshStandardMaterial color="#64748b" metalness={0.9} roughness={0.1} />
            </mesh>
          ))}
        </>
      )}

      {stage === 'reveal' && (
        // Spheres opening / glowing showing revealed bids
        <>
          {[-1.2, 0, 1.2].map((x, i) => (
            <mesh key={i} position={[x, 0.8, 0]}>
              <boxGeometry args={[0.4, 0.4, 0.4]} />
              <meshStandardMaterial color={accentColor} roughness={0.2} />
            </mesh>
          ))}
        </>
      )}

      {stage === 'screening' && (
        // Filtering: green compliant passing through, red noncompliant bouncing
        <>
          <mesh position={[0, -1.2, 0]}>
            <sphereGeometry args={[0.3, 16, 16]} />
            <meshStandardMaterial color={successColor} />
          </mesh>
          <mesh position={[-1.2, 0.8, 0]}>
            <sphereGeometry args={[0.25, 16, 16]} />
            <meshStandardMaterial color={dangerColor} />
          </mesh>
          <mesh position={[1.2, 0.8, 0]}>
            <sphereGeometry args={[0.25, 16, 16]} />
            <meshStandardMaterial color={dangerColor} />
          </mesh>
        </>
      )}

      {stage === 'finalize' && (
        // Lowest price winner highlighted at bottom
        <>
          <mesh position={[0, -1.2, 0]}>
            <cylinderGeometry args={[0.4, 0.4, 0.6, 24]} />
            <meshStandardMaterial color={successColor} emissive={successColor} emissiveIntensity={0.4} />
          </mesh>
          <mesh position={[-1.2, -0.6, 0]}>
            <cylinderGeometry args={[0.3, 0.3, 0.3, 24]} />
            <meshStandardMaterial color={accentColor} />
          </mesh>
        </>
      )}

      {stage === 'withdraw' && (
        // Pull-payment credit transfer coins
        <>
          {[-0.8, 0, 0.8].map((x, i) => (
            <mesh key={i} position={[x, -0.5 + i * 0.4, 0]} rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[0.3, 0.3, 0.08, 24]} />
              <meshStandardMaterial color="#fbbf24" metalness={0.8} roughness={0.2} />
            </mesh>
          ))}
        </>
      )}
    </group>
  )
}

export function LifecycleScene({ stage }: LifecycleSceneProps) {
  return (
    <div className="w-full h-64 sm:h-80 rounded-2xl overflow-hidden border border-border bg-surface/30">
      <Canvas
        dpr={[1, 2]}
        camera={{ position: [0, 1.2, 4], fov: 45 }}
        gl={{ antialias: true, alpha: true }}
        aria-hidden="true"
      >
        <ambientLight intensity={0.9} />
        <directionalLight position={[5, 8, 5]} intensity={1.2} />
        <StageObjects stage={stage} />
      </Canvas>
    </div>
  )
}
