export type JobStatus = 'pending' | 'downloading' | 'separating' | 'completed' | 'error'
export type JobStage = 'queued' | 'download' | 'separate' | 'done' | 'error'

export interface JobUpdate {
  status: JobStatus
  progress: number
  stage: JobStage
  message: string
  vocals_url: string | null
  accompaniment_url: string | null
  error: string | null
}
