import { useState, type FormEvent } from 'react'
import ThemeToggle from '../components/ThemeToggle'
import { apiUrl } from '../lib/api'

interface Props {
  onSuccess: () => void
  isDark: boolean
  onToggleDark: () => void
}

export default function LicensePage({ onSuccess, isDark, onToggleDark }: Props) {
  const [key, setKey] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!key.trim()) return
    setLoading(true)
    setError('')
    try {
      const res = await fetch(apiUrl('/api/license/verify'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: key.trim() }),
      })
      const data = await res.json()
      if (data.valid) {
        localStorage.setItem('license_key', key.trim())
        onSuccess()
      } else {
        setError('無効なライセンスキーです')
      }
    } catch {
      setError('サーバーに接続できません。バックエンドが起動しているか確認してください。')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center p-4 transition-colors">
      {/* Theme toggle — top right */}
      <div className="fixed top-4 right-4">
        <ThemeToggle isDark={isDark} onToggle={onToggleDark} />
      </div>

      <div className="w-full max-w-md">
        {/* Hero */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-purple-100 dark:bg-purple-600/20 mb-5">
            <span className="text-4xl">🎵</span>
          </div>
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white tracking-tight mb-2">
            AI Karaoke
          </h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm">
            YouTube動画をカラオケ音源に変換
          </p>
        </div>

        {/* Card */}
        <div className="bg-white dark:bg-gray-900 rounded-2xl p-8 shadow-sm dark:shadow-none border border-gray-200 dark:border-gray-800">
          <h2 className="text-base font-semibold text-gray-800 dark:text-gray-200 mb-6 text-center">
            ライセンス認証
          </h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs text-gray-400 dark:text-gray-500 mb-2 uppercase tracking-wider">
                ライセンスキー
              </label>
              <input
                type="text"
                value={key}
                onChange={e => setKey(e.target.value.toUpperCase())}
                placeholder="XXXX-XXXX"
                autoFocus
                className="w-full bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white px-4 py-3 rounded-lg border border-gray-300 dark:border-gray-700 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 font-mono text-center text-lg tracking-widest placeholder:text-gray-400 dark:placeholder:text-gray-600 transition-colors"
                required
              />
            </div>

            {error && (
              <div className="flex items-center gap-2 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg px-4 py-3">
                <span className="text-red-600 dark:text-red-400 text-sm">{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !key.trim()}
              className="w-full py-3 bg-purple-600 hover:bg-purple-500 active:bg-purple-700 disabled:bg-gray-100 dark:disabled:bg-gray-800 disabled:text-gray-400 dark:disabled:text-gray-600 text-white rounded-lg font-semibold transition-colors"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  確認中...
                </span>
              ) : 'アクティベート'}
            </button>
          </form>

          <p className="text-xs text-gray-400 dark:text-gray-700 text-center mt-5">
            デモ用キー:{' '}
            <button
              type="button"
              onClick={() => setKey('KARAOKE-DEMO')}
              className="font-mono text-gray-500 dark:text-gray-500 hover:text-purple-600 dark:hover:text-gray-300 transition-colors"
            >
              KARAOKE-DEMO
            </button>
          </p>
        </div>
      </div>
    </div>
  )
}
