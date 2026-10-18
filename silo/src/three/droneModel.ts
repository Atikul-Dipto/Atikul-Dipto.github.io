import * as THREE from 'three'

/** A small quadcopter: a body, four arms, four rotors and a lamp. */
export function droneModel(shell: THREE.Material, lamp: THREE.Material) {
  const g = new THREE.Group()
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.08, 0.3), shell)
  g.add(body)
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i * Math.PI) / 2
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.025, 0.28), shell)
    arm.position.set(Math.sin(a) * 0.14, 0, Math.cos(a) * 0.14)
    arm.rotation.y = a
    g.add(arm)
    const rotor = new THREE.Mesh(
      new THREE.CylinderGeometry(0.1, 0.1, 0.006, 20),
      new THREE.MeshStandardMaterial({ color: '#1a1a1a', transparent: true, opacity: 0.55 }),
    )
    rotor.position.set(Math.sin(a) * 0.27, 0.05, Math.cos(a) * 0.27)
    rotor.name = 'rotor'
    g.add(rotor)
  }
  const eye = new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 8), lamp)
  eye.position.set(0, 0, 0.16)
  g.add(eye)
  return g
}
