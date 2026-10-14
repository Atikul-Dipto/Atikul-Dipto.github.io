import { Physics } from '@react-three/rapier'
import LevelColliders from './LevelColliders'
import Player from './Player'

/**
 * The whole physics subtree, in one lazily-imported module.
 *
 * Rapier ships its engine as inlined WebAssembly, which added roughly 850 kB
 * gzipped to the main bundle when it was imported statically -- more than
 * doubling the download for every visitor, including the ones who never walk
 * anywhere. Walking is opt-in, so the engine is fetched the first time it is
 * actually asked for and never otherwise.
 *
 * Mounted only while `mode === 'walk'`, so leaving walk mode tears the physics
 * world down entirely rather than leaving it stepping in the background.
 */
export default function WalkMode({ level }: { level: number }) {
  return (
    <Physics gravity={[0, -18, 0]} timeStep="vary">
      {/*
        Only the level being stood on is given colliders. World gravity above
        is for dynamic bodies; the player is kinematic and integrates its own.
      */}
      <LevelColliders level={level} />
      <Player />
    </Physics>
  )
}
