/* Перенесено из new-crm (professio_app_69f844, src/components/softphone/transports/types.ts, коммит 241a32e9): транспорт проверен вживую на onlinePBX. Правки — только под строгий TypeScript omni4. */
export type VoipConnectionState =
  | 'connecting'
  | 'online'
  | 'offline'
  | 'error'

export type VoipCallDirection = 'incoming' | 'outgoing'

export type VoipCallState =
  | 'incoming'
  | 'dialing'
  | 'ringing'
  | 'active'
  | 'ended'

export type VoipCallOutcome =
  | 'answered'
  | 'no_answer'
  | 'busy'
  | 'failed'
  | 'canceled'

export interface VoipCallSnapshot {
  id: string
  number: string
  direction: VoipCallDirection
  state: VoipCallState
  startedAt: number
  establishedAt: number | null
  outcome: VoipCallOutcome
}

export interface VoipTransportCallbacks {
  onConnectionState: (
    state: VoipConnectionState,
    error?: string,
    retryable?: boolean,
  ) => void
  onCallState: (call: VoipCallSnapshot) => void
  onLocalStream: (callId: string, stream: MediaStream) => void
  onRemoteStream: (callId: string, stream: MediaStream) => void
}

export interface VoipTransportConfig {
  websocketUrl: string
  login: string
  password: string
  extension: string
  displayName?: string | undefined
  iceServers?: RTCIceServer[]
  callbacks: VoipTransportCallbacks
}

/**
 * Protocol-neutral contract used by the React provider.
 *
 * Verto is selected in this branch. A SIP.js adapter can implement the same
 * interface, allowing the UI and call-state logic to remain unchanged.
 */
export interface VoipTransport {
  connect: () => Promise<void>
  disconnect: () => Promise<void>
  call: (number: string) => Promise<VoipCallSnapshot>
  answer: (callId: string) => Promise<void>
  reject: (callId: string) => Promise<void>
  hangup: (callId: string) => Promise<void>
  setMuted: (callId: string, muted: boolean) => void
  setHeld: (callId: string, held: boolean) => Promise<void>
  sendDtmf: (callId: string, tone: string) => Promise<void>
  transfer: (callId: string, destination: string) => Promise<void>
}
