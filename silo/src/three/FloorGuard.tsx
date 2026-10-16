import { Component, type ReactNode } from 'react'

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
    return this.state.failed ? null : this.props.children
  }
}
