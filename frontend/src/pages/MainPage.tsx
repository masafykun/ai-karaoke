import { useState, useEffect, useRef, type FormEvent } from 'react'
import type { JobUpdate } from '../types'
import ThemeToggle from '../components/ThemeToggle'
import { apiUrl } from '../lib/api'

interface Props {
  onLogout: () => void
  isDark: boolean
  onToggleDark: () => void
}

const STAGE_LABELS: Record<string, string> = {
  queued: '待機中',
  download: 'ダウンロード中',
  separate: 'AI音源分離中',
  done: '完了',
  error: 'エラー',
}

export default function MainPage({ onLogout, isDark, onToggleDark }: Props) {
  const [url, setUrl] = useState('')
  const [jobId, setJobId] = useState<string | null>(null)
  const [job, setJob] = useState<JobUpdate | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const esRef = useRef<EventSource | null>(null)

  useEffect(() => {
    if (!jobId) return

    const es = new EventSource(apiUrl(`/api/progress/${jobId}`))
    esRef.current = es

    es.onmessage = (e) => {
      const data: JobUpdate = JSON.parse(e.data)
      setJob(data)
      if (data.status === 'completed' || data.status === 'error') {
        es.close()
        esRef.current = null
      }
    }

    es.onerror = () => {
      es.close()
      esRef.current = null
    }

    return () => {
      es.close()
      esRef.current = null
    }
  }, [jobId])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!url.trim()) return

    setSubmitting(true)
    setJob(null)
    setJobId(null)

    try {
      const res = await fetch(apiUrl('/api/process'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim() }),
      })
      if (!res.ok) throw new Error(`サーバーエラー (${res.status})`)
      const data = await res.json()
      setJobId(data.job_id)
    } catch (err) {
      setJob({
        status: 'error',
        progress: 0,
        stage: 'error',
        message: 'リクエストに失敗しました',
        vocals_url: null,
        accompaniment_url: null,
        error: String(err),
      })
    } finally {
      setSubmitting(false)
    }
  }

  const isProcessing =
    submitting || !!(job && ['pending', 'downloading', 'separating'].includes(job.status))
  const isCompleted = job?.status === 'completed'
  const isError = job?.status === 'error'

  const progressColor = isError
    ? 'bg-red-500'
    : isCompleted
    ? 'bg-green-500'
    : 'bg-purple-500'

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-white flex flex-col transition-colors">
      {/* Header */}
      <header className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 px-6 py-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-purple-100 dark:bg-purple-600/30 flex items-center justify-center text-lg">
            🎵
          </div>
          <h1 className="text-lg font-bold tracking-tight">AI Karaoke</h1>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle isDark={isDark} onToggle={onToggleDark} />
          <button
            onClick={onLogout}
            className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-500 dark:hover:text-gray-300 transition-colors px-2 py-1"
          >
            ログアウト
          </button>
        </div>
      </header>

      {/* Main */}
      <main className="flex-1 max-w-2xl w-full mx-auto px-4 py-10 space-y-5">
        {/* Input card */}
        <div className="bg-white dark:bg-gray-900 rounded-2xl p-7 border border-gray-200 dark:border-gray-800 shadow-sm dark:shadow-none">
          <h2 className="font-semibold mb-1 text-gray-900 dark:text-white">
            YouTube URLを入力
          </h2>
          <p className="text-gray-500 dark:text-gray-400 text-sm mb-5">
            歌動画のURLを貼り付けると、ボーカルと伴奏を分離します
          </p>
          <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3">
            <input
              type="url"
              value={url}
              onChange={e => setUrl(e.target.value)}
              placeholder="https://www.youtube.com/watch?v=..."
              className="flex-1 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white px-4 py-3 rounded-lg border border-gray-300 dark:border-gray-700 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 text-sm placeholder:text-gray-400 dark:placeholder:text-gray-600 transition-colors disabled:opacity-50"
              disabled={isProcessing}
              required
            />
            <button
              type="submit"
              disabled={isProcessing || !url.trim()}
              className="px-6 py-3 bg-purple-600 hover:bg-purple-500 active:bg-purple-700 disabled:bg-gray-100 dark:disabled:bg-gray-800 disabled:text-gray-400 dark:disabled:text-gray-600 text-white rounded-lg font-semibold transition-colors whitespace-nowrap text-sm"
            >
              {submitting ? '送信中...' : isProcessing ? '処理中...' : '変換開始'}
            </button>
          </form>
        </div>

        {/* Progress card */}
        {job && (isProcessing || isError) && (
          <div className="bg-white dark:bg-gray-900 rounded-2xl p-7 border border-gray-200 dark:border-gray-800 shadow-sm dark:shadow-none space-y-4">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium text-gray-700 dark:text-gray-300">
                {STAGE_LABELS[job.stage] ?? '処理中'}
              </span>
              <span className="text-gray-400 dark:text-gray-500 tabular-nums">
                {job.progress}%
              </span>
            </div>

            <div className="w-full bg-gray-200 dark:bg-gray-800 rounded-full h-1.5 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ease-out ${progressColor}`}
                style={{ width: `${job.progress}%` }}
              />
            </div>

            <p className={`text-sm ${isError ? 'text-red-600 dark:text-red-400' : 'text-gray-500 dark:text-gray-400'}`}>
              {job.message}
            </p>
            {job.error && (
              <p className="text-xs text-red-600 dark:text-red-500 font-mono bg-red-50 dark:bg-red-950/40 rounded p-2 break-all">
                {job.error}
              </p>
            )}
          </div>
        )}

        {/* Completed progress bar */}
        {isCompleted && (
          <div className="bg-white dark:bg-gray-900 rounded-2xl p-7 border border-gray-200 dark:border-gray-800 shadow-sm dark:shadow-none space-y-4">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium text-green-600 dark:text-green-400 flex items-center gap-1.5">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                変換完了
              </span>
              <span className="text-gray-400 dark:text-gray-500">100%</span>
            </div>
            <div className="w-full bg-gray-200 dark:bg-gray-800 rounded-full h-1.5">
              <div className="h-full rounded-full bg-green-500 w-full" />
            </div>
          </div>
        )}

        {/* Results card */}
        {isCompleted && job?.vocals_url && job?.accompaniment_url && (
          <div className="bg-white dark:bg-gray-900 rounded-2xl p-7 border border-gray-200 dark:border-gray-800 shadow-sm dark:shadow-none">
            <h3 className="font-semibold mb-5 text-gray-900 dark:text-white">ダウンロード</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <DownloadCard
                label="ボーカル"
                description="歌声のみ抽出"
                icon="🎤"
                url={job.vocals_url}
                filename="vocals.wav"
              />
              <DownloadCard
                label="伴奏（カラオケ）"
                description="ボーカルなし"
                icon="🎹"
                url={job.accompaniment_url}
                filename="no_vocals.wav"
              />
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

interface DownloadCardProps {
  label: string
  description: string
  icon: string
  url: string
  filename: string
}

function DownloadCard({ label, description, icon, url, filename }: DownloadCardProps) {
  return (
    <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-5 flex flex-col items-center gap-3 border border-gray-200 dark:border-gray-700 hover:border-purple-400 dark:hover:border-purple-700 transition-colors">
      <span className="text-4xl">{icon}</span>
      <div className="text-center">
        <p className="font-semibold text-sm text-gray-800 dark:text-gray-200">{label}</p>
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{description}</p>
      </div>
      <a
        href={url}
        download={filename}
        className="w-full py-2 bg-purple-600 hover:bg-purple-500 active:bg-purple-700 text-white rounded-lg text-sm font-semibold text-center transition-colors"
      >
        ダウンロード
      </a>
    </div>
  )
}
