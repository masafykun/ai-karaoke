import { useState, useEffect } from 'react'
import LicensePage from './pages/LicensePage'
import MainPage from './pages/MainPage'

export default function App() {
  const [licensed, setLicensed] = useState(false)
  const [ready, setReady] = useState(false)
  const [isDark, setIsDark] = useState(false)

  useEffect(() => {
    setLicensed(!!localStorage.getItem('license_key'))

    const saved = localStorage.getItem('theme')
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    const dark = saved === 'dark' || (!saved && prefersDark)
    setIsDark(dark)
    // index.html script already applied the class, just sync state
    setReady(true)
  }, [])

  const toggleDark = () => {
    setIsDark(prev => {
      const next = !prev
      localStorage.setItem('theme', next ? 'dark' : 'light')
      document.documentElement.classList.toggle('dark', next)
      return next
    })
  }

  if (!ready) return null

  const handleLogout = () => {
    localStorage.removeItem('license_key')
    setLicensed(false)
  }

  return licensed
    ? <MainPage onLogout={handleLogout} isDark={isDark} onToggleDark={toggleDark} />
    : <LicensePage onSuccess={() => setLicensed(true)} isDark={isDark} onToggleDark={toggleDark} />
}
