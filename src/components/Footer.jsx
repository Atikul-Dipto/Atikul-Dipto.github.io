import { profile } from '../data'

export default function Footer() {
  return (
    <footer className="footer">
      <p>
        © {new Date().getFullYear()} {profile.name}. Built with React &amp; Vite,
        deployed on GitHub Pages.
      </p>
    </footer>
  )
}
