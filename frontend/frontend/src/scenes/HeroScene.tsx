import { useRef, useMemo, Component, type ReactNode } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useTheme } from '@/theme/ThemeProvider'
import { FallbackHeroGraphic } from './FallbackScene'

// Error boundary to catch WebGL context failure
interface EBProps {
  children: ReactNode
}
interface EBState {
  hasError: boolean
}

class CanvasErrorBoundary extends Component<EBProps, EBState> {
  constructor(props: EBProps) {
    super(props)
    this.state = { hasError: false }
  }
  static getDerivedStateFromError() {
    return { hasError: true }
  }
  componentDidCatch(error: Error) {
    console.warn('WebGL/Three.js context failed, rendering fallback:', error)
  }
  render() {
    if (this.state.hasError) {
      return <FallbackHeroGraphic />
    }
    return this.props.children
  }
}

interface SieveMeshProps {
  accentColor: string
}

function SieveMeshDisc({ accentColor }: SieveMeshProps) {
  const meshRef = useRef<THREE.Group>(null)

  useFrame((_, delta) => {
    if (meshRef.current) {
      meshRef.current.rotation.z += delta * 0.15
    }
  })

  // Circular grid rings
  return (
    <group ref={meshRef} position={[0, 0, 0]} rotation={[-Math.PI / 3, 0, 0]}>
      {/* Outer thick rim */}
      <mesh>
        <torusGeometry args={[2.5, 0.08, 16, 64]} />
        <meshStandardMaterial color={accentColor} metalness={0.8} roughness={0.2} />
      </mesh>
      {/* Inner concentric rings */}
      {[0.6, 1.2, 1.8, 2.4].map((radius, i) => (
        <mesh key={i}>
          <ringGeometry args={[radius - 0.015, radius + 0.015, 48]} />
          <meshBasicMaterial color={accentColor} opacity={0.4} transparent wireframe />
        </mesh>
      ))}
      {/* Radial spokes */}
      {Array.from({ length: 12 }).map((_, i) => {
        const angle = (i * Math.PI) / 6
        return (
          // @ts-expect-error R3F <line> is typed as SVG <line> in JSX
          <line key={i} rotation={[0, 0, angle]}>
            <bufferGeometry
              attach="geometry"
              onUpdate={(self) => {
                const pts = [new THREE.Vector3(-2.4, 0, 0), new THREE.Vector3(2.4, 0, 0)]
                self.setFromPoints(pts)
              }}
            />
            <lineBasicMaterial color={accentColor} opacity={0.3} transparent />
          </line>
        )
      })}
    </group>
  )
}

interface ParticleData {
  pos: THREE.Vector3
  speed: number
  isCompliant: boolean
  alpha: number
  settled: boolean
}

function FallingBids({
  accentColor,
  successColor,
  dangerColor,
}: {
  accentColor: string
  successColor: string
  dangerColor: string
}) {
  const count = 48
  const particles = useMemo<ParticleData[]>(() => {
    return Array.from({ length: count }).map((_, i) => ({
      pos: new THREE.Vector3(
        (Math.random() - 0.5) * 3.5,
        1.5 + Math.random() * 2.5,
        (Math.random() - 0.5) * 2
      ),
      speed: 0.8 + Math.random() * 0.6,
      isCompliant: i % 3 === 0, // 1 in 3 compliant, rest bounce
      alpha: 1.0,
      settled: false,
    }))
  }, [count])

  const instRef = useRef<THREE.InstancedMesh>(null)
  const dummy = useMemo(() => new THREE.Object3D(), [])

  useFrame((_, delta) => {
    if (!instRef.current) return

    particles.forEach((p, i) => {
      if (!p.settled) {
        p.pos.y -= delta * p.speed

        // Hit sieve at y ~ 0
        if (p.pos.y <= 0) {
          if (p.isCompliant) {
            // Passes through to lower collection
            if (p.pos.y <= -1.8) {
              p.pos.y = -1.8
              p.settled = true
            }
          } else {
            // Bounces off and fades
            p.pos.y += delta * 1.5
            p.pos.x += (Math.random() - 0.5) * delta * 2
            p.alpha -= delta * 1.2
            if (p.alpha <= 0) {
              // Reset particle
              p.pos.set((Math.random() - 0.5) * 3.5, 2.5 + Math.random() * 1.5, (Math.random() - 0.5) * 2)
              p.alpha = 1.0
            }
          }
        }
      } else {
        // Slowly respawn settled ones after some time
        p.alpha -= delta * 0.2
        if (p.alpha <= 0.1) {
          p.pos.set((Math.random() - 0.5) * 3.5, 2.5 + Math.random() * 1.5, (Math.random() - 0.5) * 2)
          p.alpha = 1.0
          p.settled = false
        }
      }

      dummy.position.copy(p.pos)
      const scale = p.isCompliant ? 0.08 : 0.06
      dummy.scale.set(scale, scale, scale)
      dummy.updateMatrix()
      instRef.current!.setMatrixAt(i, dummy.matrix)

      // Color: green for compliant passing through, red/accent for noncompliant
      const color = p.isCompliant
        ? new THREE.Color(successColor)
        : p.pos.y <= 0.2
        ? new THREE.Color(dangerColor)
        : new THREE.Color(accentColor)
      instRef.current!.setColorAt(i, color)
    })

    instRef.current.instanceMatrix.needsUpdate = true
    if (instRef.current.instanceColor) instRef.current.instanceColor.needsUpdate = true
  })

  return (
    <instancedMesh ref={instRef} args={[undefined, undefined, count]}>
      <sphereGeometry args={[1, 16, 16]} />
      <meshStandardMaterial roughness={0.3} emissiveIntensity={0.6} />
    </instancedMesh>
  )
}

function SceneContent() {
  const { theme } = useTheme()

  const colors = useMemo(() => {
    if (theme === 'light') {
      return {
        accent: '#6d28d9',
        success: '#059669',
        danger: '#dc2626',
      }
    }
    if (theme === 'dim') {
      return {
        accent: '#a78bfa',
        success: '#34d399',
        danger: '#f87171',
      }
    }
    return {
      accent: '#c4b5fd',
      success: '#4ade80',
      danger: '#f87171',
    }
  }, [theme])

  return (
    <>
      <ambientLight intensity={0.8} />
      <directionalLight position={[5, 10, 5]} intensity={1.2} />
      <pointLight position={[0, -2, 2]} intensity={0.8} color={colors.success} />
      <SieveMeshDisc accentColor={colors.accent} />
      <FallingBids
        accentColor={colors.accent}
        successColor={colors.success}
        dangerColor={colors.danger}
      />
    </>
  )
}

export function HeroScene() {
  return (
    <div className="relative w-full h-80 sm:h-96 md:h-[420px] rounded-2xl overflow-hidden border border-border bg-surface/30">
      <CanvasErrorBoundary>
        <Canvas
          dpr={[1, 2]}
          camera={{ position: [0, 1.5, 4.5], fov: 50 }}
          gl={{ antialias: true, alpha: true }}
          aria-hidden="true"
        >
          <SceneContent />
        </Canvas>
      </CanvasErrorBoundary>
    </div>
  )
}
