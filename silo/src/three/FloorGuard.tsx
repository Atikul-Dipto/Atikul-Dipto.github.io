import { Component, useLayoutEffect, useRef, type ReactNode } from 'react'
import { useThree } from '@react-three/fiber'
import type * as THREE from 'three'
import { warmUp } from './warm'

/**
 * Every texture under an object, sent to the GPU a few at a time, a frame
 * apart. Left to the first draw, a floor's textures -- canvas-drawn signs,
 * screens, panels -- all went up at once, inside one frame.
 */
function uploadTextures(gl: THREE.WebGLRenderer, root: THREE.Object3D) {
  const textures = new Set<THREE.Texture>()
  root.traverse((o) => {
    const m = (o as THREE.Mesh).material
    if (!m) return
    for (const mat of Array.isArray(m) ? m : [m]) {
      for (const v of Object.values(mat)) if (v && (v as THREE.Texture).isTexture) textures.add(v as THREE.Texture)
      const uniforms = (mat as THREE.ShaderMaterial).uniforms
      if (uniforms) for (const u of Object.values(uniforms)) if (u?.value?.isTexture) textures.add(u.value)
    }
  })
  const queue = [...textures].filter((t) => !(t as THREE.Texture & { isRenderTargetTexture?: boolean }).isRenderTargetTexture)
  return new Promise<void>((resolve) => {
    const step = () => {
      const t0 = performance.now()
      while (queue.length && performance.now() - t0 < 6) gl.initTexture(queue.shift()!)
      if (queue.length) requestAnimationFrame(step)
      else resolve()
    }
    step()
  })
}

/**
 * A floor's fit-out, compiled before it is shown: hidden while the driver
 * compiles its shaders in the background and its textures go up, then
 * revealed. Mounting a floor no
 * longer freezes the page for the length of a compile -- when the lift
 * arrives, or when the drone flies past.
 */
function CompileReveal({ children }: { children: ReactNode }) {
  const group = useRef<THREE.Group>(null)
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  const camera = useThree((s) => s.camera)
  useLayoutEffect(() => {
    const g = group.current
    if (!g) return
    g.visible = false
    let alive = true
    const show = () => {
      if (alive) g.visible = true
    }
    const upload = () => uploadTextures(gl, g).then(show, show)
    warmUp(gl, g, camera, scene).then(upload, upload)
    const id = window.setTimeout(show, 8000)
    return () => {
      alive = false
      window.clearTimeout(id)
    }
  }, [gl, scene, camera])
  return <group ref={group}>{children}</group>
}

/**
 * One floor's fit-out, fenced off. If anything in it throws -- a texture that
 * will not build, a driver that refuses a shader -- that floor is left bare
 * and the rest of the silo carries on. Without this, one bad mesh unmounts
 * the whole canvas, and the visitor sees the site go black.
 */
export default class FloorGuard extends Component<{ name: string; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: unknown) {
    console.error(`The fit-out of ${this.props.name} failed and was left out:`, error)
  }

  render() {
    return this.state.failed ? null : <CompileReveal>{this.props.children}</CompileReveal>
  }
}
