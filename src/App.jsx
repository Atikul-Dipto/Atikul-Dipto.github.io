import AnimatedBackground from './components/AnimatedBackground'
import Navbar from './components/Navbar'
import Hero from './components/Hero'
import About from './components/About'
import Skills from './components/Skills'
import Experience from './components/Experience'
import Projects from './components/Projects'
import Dashboards from './components/Dashboards'
import TrendDivider from './components/TrendDivider'
import SqlShowcase from './components/SqlShowcase'
import Writing from './components/Writing'
import Contact from './components/Contact'
import Footer from './components/Footer'
import './App.css'

function App() {
  return (
    <>
      <AnimatedBackground />
      <Navbar />
      <main>
        <Hero />
        <About />
        <TrendDivider seed={7} label="Trend up and to the right" />
        <Skills />
        <Experience />
        <TrendDivider seed={23} label="Built, shipped, measured" />
        <Projects />
        <Dashboards />
        <SqlShowcase />
        <Writing />
        <Contact />
      </main>
      <Footer />
    </>
  )
}

export default App
