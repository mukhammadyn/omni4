/* Перенесено из new-crm (professio_app_69f844, src/components/softphone/transports/VertoTransport.ts, коммит 241a32e9): транспорт проверен вживую на onlinePBX. Правки — только под строгий TypeScript omni4. */
import type {
  VoipCallDirection,
  VoipCallOutcome,
  VoipCallSnapshot,
  VoipTransport,
  VoipTransportConfig,
} from './types'
import {
  asRecord,
  asString,
  classifyVertoLoginFailure,
  createVertoDialogParams,
  createVertoLoginParams,
  getVertoCallId,
  getVertoRemoteIdentity,
  getVertoRemoteSdp,
  getVertoSocketCloseMessage,
  mapVertoCauseToOutcome,
  parseJsonRpcMessages,
  serializeJsonRpcError,
  serializeJsonRpcRequest,
  serializeJsonRpcResult,
  type VertoDialogParams,
} from './vertoProtocol'

type JsonPrimitive = string | number | boolean | null
type JsonValue =
  | JsonPrimitive
  | JsonValue[]
  | { [key: string]: JsonValue | undefined }

interface JsonRpcError {
  code: number
  message: string
  data?: JsonValue
}

interface JsonRpcMessage {
  jsonrpc?: string
  id?: string | number | null
  method?: string
  params?: Record<string, unknown>
  result?: unknown
  error?: JsonRpcError
}

interface PendingRequest {
  method: string
  resolve: (result: unknown) => void
  reject: (error: Error) => void
  timeout: number
}

interface VertoSession {
  snapshot: VoipCallSnapshot
  dialogParams: VertoDialogParams
  remoteOfferSdp: string | null
  peerConnection: RTCPeerConnection | null
  localStream: MediaStream | null
  remoteDescriptionApplied: boolean
  held: boolean
  ended: boolean
}

const CONNECT_TIMEOUT = 10_000
const LOGIN_TIMEOUT = 15_000
const REQUEST_TIMEOUT = 12_000
const ICE_GATHERING_TIMEOUT = 5_000

// Browser WebSocket handles protocol-level Ping/Pong automatically.
// The onlinePBX gateway rejects application-level `verto.ping` and `echo`,
// so sending either as a heartbeat would disconnect an otherwise healthy call.

function createUuid() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (value) => {
    const random = Math.floor(Math.random() * 16)
    const nibble = value === 'x' ? random : (random & 0x3) | 0x8
    return nibble.toString(16)
  })
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message
  return String(error)
}

function microphoneError(error: unknown) {
  const permissionDenied =
    error instanceof DOMException &&
    (error.name === 'NotAllowedError' || error.name === 'SecurityError')

  return new Error(
    permissionDenied
      ? 'Разрешите доступ к микрофону в настройках браузера'
      : 'Не удалось получить доступ к микрофону',
  )
}

export class VertoTransport implements VoipTransport {
  private socket: WebSocket | null = null
  private connectPromise: Promise<void> | null = null
  private connectResolve: (() => void) | null = null
  private connectReject: ((error: Error) => void) | null = null
  private connectTimer: number | null = null
  private intentionalClose = false
  private suppressNextCloseState = false
  private loggedIn = false
  private requestId = 0
  private readonly sessionId = createUuid()
  private readonly pendingRequests = new Map<number, PendingRequest>()
  private readonly sessions = new Map<string, VertoSession>()

  constructor(private readonly config: VoipTransportConfig) {}

  connect() {
    if (this.loggedIn && this.socket?.readyState === WebSocket.OPEN) {
      return Promise.resolve()
    }
    if (this.connectPromise) return this.connectPromise

    this.intentionalClose = false
    this.config.callbacks.onConnectionState('connecting')
    this.connectPromise = new Promise<void>((resolve, reject) => {
      this.connectResolve = resolve
      this.connectReject = reject

      let socket: WebSocket
      try {
        socket = new WebSocket(this.config.websocketUrl)
      } catch (error) {
        this.failConnect(
          new Error(`Не удалось открыть WebSocket: ${getErrorMessage(error)}`),
        )
        return
      }

      this.socket = socket
      this.connectTimer = window.setTimeout(() => {
        const error = new Error(
          `onlinePBX Verto не ответил за ${CONNECT_TIMEOUT / 1000} секунд`,
        )
        this.failConnect(error)
        socket.close()
      }, CONNECT_TIMEOUT)

      socket.onopen = () => {
        this.clearConnectTimer()
        void this.login()
      }
      socket.onmessage = (event) => this.handleSocketMessage(event.data)
      socket.onerror = () => {
        if (socket.readyState !== WebSocket.OPEN) {
          this.failConnect(
            new Error('Не удалось установить WebSocket-соединение с onlinePBX'),
          )
        }
      }
      socket.onclose = (event) => this.handleSocketClose(event)
    })

    return this.connectPromise
  }

  async disconnect() {
    this.intentionalClose = true
    this.loggedIn = false
    this.clearConnectTimer()
    this.rejectPendingRequests(new Error('Verto transport disconnected'))

    for (const session of [...this.sessions.values()]) {
      this.endSession(
        session,
        session.snapshot.establishedAt ? 'answered' : 'canceled',
      )
    }

    const socket = this.socket
    this.socket = null
    this.connectPromise = null
    this.connectResolve = null
    this.connectReject = null
    if (
      socket &&
      (socket.readyState === WebSocket.OPEN ||
        socket.readyState === WebSocket.CONNECTING)
    ) {
      socket.close(1000, 'Softphone disconnected')
    }
  }

  async call(number: string) {
    this.assertOnline()
    const callId = createUuid()
    const dialogParams = createVertoDialogParams({
      callId,
      destination: number,
      login: this.config.login,
      extension: this.config.extension,
      displayName: this.config.displayName,
      remoteName: 'Outbound Call',
    })
    const session = this.createSession(
      callId,
      number,
      'outgoing',
      'dialing',
      dialogParams,
    )

    try {
      const peerConnection = await this.createPeerConnection(session)
      const offer = await peerConnection.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: false,
      })
      await peerConnection.setLocalDescription(offer)
      await this.waitForIceGathering(peerConnection)
      const sdp = peerConnection.localDescription?.sdp
      if (!sdp) throw new Error('Браузер не сформировал WebRTC SDP')

      await this.request(
        'verto.invite',
        {
          dialogParams,
          sdp,
          sessid: this.sessionId,
        },
        REQUEST_TIMEOUT,
      )
      this.updateSession(session, { state: 'ringing' })
      return { ...session.snapshot }
    } catch (error) {
      this.endSession(session, 'failed')
      throw error
    }
  }

  async answer(callId: string) {
    this.assertOnline()
    const session = this.requireSession(callId)
    if (session.snapshot.state !== 'incoming' || !session.remoteOfferSdp) {
      throw new Error('Входящий звонок уже недоступен')
    }

    const peerConnection = await this.createPeerConnection(session)
    await peerConnection.setRemoteDescription({
      type: 'offer',
      sdp: session.remoteOfferSdp,
    })
    session.remoteDescriptionApplied = true
    const answer = await peerConnection.createAnswer()
    await peerConnection.setLocalDescription(answer)
    await this.waitForIceGathering(peerConnection)
    const sdp = peerConnection.localDescription?.sdp
    if (!sdp) throw new Error('Браузер не сформировал WebRTC SDP')

    await this.request(
      'verto.answer',
      {
        dialogParams: session.dialogParams,
        sdp,
        sessid: this.sessionId,
      },
      REQUEST_TIMEOUT,
    )
    this.activateSession(session)
  }

  async reject(callId: string) {
    const session = this.requireSession(callId)
    await this.sendBye(session, 'CALL_REJECTED')
    this.endSession(
      session,
      session.snapshot.direction === 'incoming' ? 'no_answer' : 'canceled',
    )
  }

  async hangup(callId: string) {
    const session = this.requireSession(callId)
    await this.sendBye(session, 'NORMAL_CLEARING')
    this.endSession(
      session,
      session.snapshot.establishedAt ? 'answered' : 'canceled',
    )
  }

  setMuted(callId: string, muted: boolean) {
    const session = this.requireSession(callId)
    session.peerConnection?.getSenders().forEach((sender) => {
      if (sender.track?.kind === 'audio') sender.track.enabled = !muted
    })
  }

  async setHeld(callId: string, held: boolean) {
    const session = this.requireActiveSession(callId)
    await this.request('verto.modify', {
      dialogParams: session.dialogParams,
      action: held ? 'hold' : 'unhold',
      sessid: this.sessionId,
    })
    session.held = held
  }

  async sendDtmf(callId: string, tone: string) {
    const session = this.requireActiveSession(callId)
    const dtmfSender = session.peerConnection
      ?.getSenders()
      .find((sender) => sender.track?.kind === 'audio')?.dtmf

    if (dtmfSender?.canInsertDTMF) {
      dtmfSender.insertDTMF(tone, 250, 100)
      return
    }

    await this.request('verto.info', {
      dialogParams: session.dialogParams,
      dtmf: tone,
      sessid: this.sessionId,
    })
  }

  async transfer(callId: string, destination: string) {
    const session = this.requireActiveSession(callId)
    await this.request('verto.modify', {
      dialogParams: session.dialogParams,
      action: 'transfer',
      destination,
      sessid: this.sessionId,
    })
  }

  private async login() {
    try {
      await this.request(
        'login',
        createVertoLoginParams({
          login: this.config.login,
          password: this.config.password,
          sessionId: this.sessionId,
        }),
        LOGIN_TIMEOUT,
      )
      this.loggedIn = true
      this.connectResolve?.()
      this.connectResolve = null
      this.connectReject = null
      this.config.callbacks.onConnectionState('online')
    } catch (error) {
      const reason = getErrorMessage(error)
      const failure = classifyVertoLoginFailure(reason)
      const loginError = new Error(
        failure === 'password_rejected'
          ? 'onlinePBX нашёл оператора, но отклонил Verto-пароль. Backend должен вернуть актуальный verto_password (jsonrpc-password), а не обычный SIP-пароль'
          : failure === 'login_not_found'
            ? 'onlinePBX не нашёл Verto login: проверьте полный login и домен оператора'
            : failure === 'authentication_rejected'
              ? 'onlinePBX отклонил Verto credentials, полученные от backend'
              : `Не удалось войти в onlinePBX по Verto: ${reason}`,
      )
      this.failConnect(loginError, failure === 'other')
      this.socket?.close()
    }
  }

  private request(
    method: string,
    params: Record<string, unknown> = {},
    timeoutMs = REQUEST_TIMEOUT,
  ) {
    const socket = this.socket
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error('WebSocket onlinePBX не подключён'))
    }

    const id = ++this.requestId
    return new Promise<unknown>((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        this.pendingRequests.delete(id)
        reject(new Error(`onlinePBX не ответил на ${method}`))
      }, timeoutMs)

      this.pendingRequests.set(id, {
        method,
        resolve,
        reject,
        timeout,
      })
      socket.send(serializeJsonRpcRequest({ id, method, params }))
    })
  }

  private handleSocketMessage(raw: unknown) {
    parseJsonRpcMessages(raw).forEach((value) => {
      const message = value as JsonRpcMessage
      if (message.method) {
        void this.handleServerMethod(message).catch((error) => {
          console.warn('[verto] Failed to handle server message', error)
          if (message.id != null) {
            this.sendRpcError(
              message.id,
              -32002,
              getErrorMessage(error),
            )
          }
        })
        return
      }
      if (message.id != null) this.handleRpcResponse(message)
    })
  }

  private handleRpcResponse(message: JsonRpcMessage) {
    const numericId =
      typeof message.id === 'number'
        ? message.id
        : Number.parseInt(String(message.id), 10)
    if (!Number.isFinite(numericId)) return

    const pending = this.pendingRequests.get(numericId)
    if (!pending) return
    this.pendingRequests.delete(numericId)
    window.clearTimeout(pending.timeout)

    if (message.error) {
      pending.reject(
        new Error(
          `${message.error.message}${
            message.error.code ? ` (${message.error.code})` : ''
          }`,
        ),
      )
      return
    }
    pending.resolve(message.result)
  }

  private async handleServerMethod(message: JsonRpcMessage) {
    const method = message.method ?? ''
    const params = asRecord(message.params)

    if (method === 'verto.invite') {
      this.handleIncomingInvite(params)
    } else if (method === 'verto.media') {
      await this.handleRemoteMedia(params)
    } else if (method === 'verto.answer') {
      await this.handleRemoteAnswer(params)
    } else if (method === 'verto.display') {
      this.handleDisplay(params)
    } else if (method === 'verto.bye') {
      this.handleRemoteBye(params)
    } else if (method === 'verto.punt') {
      const message = 'onlinePBX завершил предыдущую Verto-сессию'
      this.config.callbacks.onConnectionState('error', message)
      this.suppressNextCloseState = true
      this.socket?.close()
    } else if (method === 'verto.attach') {
      if (message.id != null) {
        this.sendRpcError(
          message.id,
          -32601,
          'Session recovery is not supported',
        )
      }
      return
    }

    if (message.id != null) {
      this.sendRpcResult(message.id, { method })
    }
  }

  private handleIncomingInvite(params: Record<string, unknown>) {
    const callId = getVertoCallId(params)
    const sdp = getVertoRemoteSdp(params)
    if (!callId || !sdp) {
      throw new Error('onlinePBX прислал неполный Verto INVITE')
    }

    const existing = this.sessions.get(callId)
    if (existing) return

    const remoteIdentity = getVertoRemoteIdentity(params)
    const number = remoteIdentity.number
    const remoteName = remoteIdentity.name
    const nestedDialog = asRecord(params.dialogParams)
    const sourceDialog =
      Object.keys(nestedDialog).length > 0 ? nestedDialog : params
    const dialogParams: VertoDialogParams = {
      ...createVertoDialogParams({
        callId,
        destination: number,
        login: this.config.login,
        extension: this.config.extension,
        displayName: this.config.displayName,
        remoteName: remoteName || number,
      }),
      destination_number:
        asString(sourceDialog.destination_number) || this.config.extension,
      caller_id_name:
        asString(sourceDialog.caller_id_name) || remoteName || number,
      caller_id_number:
        asString(sourceDialog.caller_id_number) || number,
      remote_caller_id_name:
        asString(sourceDialog.remote_caller_id_name) || remoteName || number,
      remote_caller_id_number:
        asString(sourceDialog.remote_caller_id_number) || number,
      callee_id_name: asString(sourceDialog.callee_id_name) || undefined,
      callee_id_number: asString(sourceDialog.callee_id_number) || undefined,
      display_direction:
        asString(sourceDialog.display_direction) || undefined,
    }
    const session = this.createSession(
      callId,
      number,
      'incoming',
      'incoming',
      dialogParams,
    )
    session.remoteOfferSdp = sdp
  }

  private async handleRemoteMedia(params: Record<string, unknown>) {
    const session = this.sessions.get(getVertoCallId(params))
    if (!session || session.snapshot.direction !== 'outgoing') return
    const sdp = getVertoRemoteSdp(params)
    if (sdp) await this.applyRemoteAnswer(session, sdp)
    if (session.snapshot.state === 'dialing') {
      this.updateSession(session, { state: 'ringing' })
    }
  }

  private async handleRemoteAnswer(params: Record<string, unknown>) {
    const session = this.sessions.get(getVertoCallId(params))
    if (!session) return
    const sdp = getVertoRemoteSdp(params)
    if (
      sdp &&
      session.snapshot.direction === 'outgoing' &&
      !session.remoteDescriptionApplied
    ) {
      await this.applyRemoteAnswer(session, sdp)
    }
    this.activateSession(session)
  }

  private handleDisplay(params: Record<string, unknown>) {
    const session = this.sessions.get(getVertoCallId(params))
    if (
      !session ||
      session.snapshot.direction !== 'outgoing' ||
      session.snapshot.state === 'active'
    ) {
      return
    }
    const number = getVertoRemoteIdentity(params).number
    this.updateSession(session, {
      number: number === 'Неизвестный номер' ? session.snapshot.number : number,
      state: 'ringing',
    })
  }

  private handleRemoteBye(params: Record<string, unknown>) {
    const session = this.sessions.get(getVertoCallId(params))
    if (!session) return
    const cause =
      asString(params.cause) ||
      asString(asRecord(params.dialogParams).cause) ||
      'UNKNOWN'
    this.endSession(
      session,
      mapVertoCauseToOutcome({
        established: Boolean(session.snapshot.establishedAt),
        direction: session.snapshot.direction,
        cause,
      }),
    )
  }

  private async applyRemoteAnswer(session: VertoSession, sdp: string) {
    const peerConnection = session.peerConnection
    if (!peerConnection || session.remoteDescriptionApplied) return
    await peerConnection.setRemoteDescription({ type: 'answer', sdp })
    session.remoteDescriptionApplied = true
  }

  private activateSession(session: VertoSession) {
    if (session.ended || session.snapshot.state === 'active') return
    const establishedAt = Date.now()
    this.updateSession(session, {
      state: 'active',
      establishedAt,
      outcome: 'answered',
    })
  }

  private createSession(
    callId: string,
    number: string,
    direction: VoipCallDirection,
    state: VoipCallSnapshot['state'],
    dialogParams: VertoDialogParams,
  ) {
    const session: VertoSession = {
      snapshot: {
        id: callId,
        number,
        direction,
        state,
        startedAt: Date.now(),
        establishedAt: null,
        outcome: direction === 'outgoing' ? 'failed' : 'no_answer',
      },
      dialogParams,
      remoteOfferSdp: null,
      peerConnection: null,
      localStream: null,
      remoteDescriptionApplied: false,
      held: false,
      ended: false,
    }
    this.sessions.set(callId, session)
    this.emitCall(session)
    return session
  }

  private async createPeerConnection(session: VertoSession) {
    if (session.peerConnection) return session.peerConnection
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('Браузер не поддерживает доступ к микрофону')
    }

    let localStream: MediaStream
    try {
      localStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false,
      })
    } catch (error) {
      throw microphoneError(error)
    }

    const peerConnection = new RTCPeerConnection({
      iceServers: this.config.iceServers ?? [],
    })
    localStream.getTracks().forEach((track) => {
      peerConnection.addTrack(track, localStream)
    })
    peerConnection.addEventListener('track', (event) => {
      const stream =
        event.streams[0] ??
        new MediaStream(
          peerConnection
            .getReceivers()
            .map((receiver) => receiver.track)
            .filter(
              (track): track is MediaStreamTrack =>
                Boolean(track && track.kind === 'audio'),
            ),
        )
      this.config.callbacks.onRemoteStream(session.snapshot.id, stream)
    })
    peerConnection.addEventListener('connectionstatechange', () => {
      if (
        !session.ended &&
        (peerConnection.connectionState === 'failed' ||
          peerConnection.connectionState === 'closed')
      ) {
        this.endSession(
          session,
          session.snapshot.establishedAt ? 'answered' : 'failed',
        )
      }
    })

    session.localStream = localStream
    session.peerConnection = peerConnection
    this.config.callbacks.onLocalStream(session.snapshot.id, localStream)
    return peerConnection
  }

  private waitForIceGathering(peerConnection: RTCPeerConnection) {
    if (peerConnection.iceGatheringState === 'complete') {
      return Promise.resolve()
    }

    return new Promise<void>((resolve) => {
      const timeout = window.setTimeout(done, ICE_GATHERING_TIMEOUT)
      const onStateChange = () => {
        if (peerConnection.iceGatheringState === 'complete') done()
      }
      function done() {
        window.clearTimeout(timeout)
        peerConnection.removeEventListener(
          'icegatheringstatechange',
          onStateChange,
        )
        resolve()
      }
      peerConnection.addEventListener(
        'icegatheringstatechange',
        onStateChange,
      )
    })
  }

  private async sendBye(session: VertoSession, cause: string) {
    if (session.ended || this.socket?.readyState !== WebSocket.OPEN) return
    try {
      await this.request('verto.bye', {
        dialogParams: session.dialogParams,
        cause,
        sessid: this.sessionId,
      })
    } catch (error) {
      if (this.socket?.readyState === WebSocket.OPEN) throw error
    }
  }

  private endSession(session: VertoSession, outcome: VoipCallOutcome) {
    if (session.ended) return
    session.ended = true
    session.localStream?.getTracks().forEach((track) => track.stop())
    session.peerConnection?.close()
    session.localStream = null
    session.peerConnection = null
    session.snapshot = {
      ...session.snapshot,
      state: 'ended',
      outcome,
    }
    this.sessions.delete(session.snapshot.id)
    this.emitCall(session)
  }

  private updateSession(
    session: VertoSession,
    patch: Partial<VoipCallSnapshot>,
  ) {
    if (session.ended) return
    session.snapshot = { ...session.snapshot, ...patch }
    this.emitCall(session)
  }

  private emitCall(session: VertoSession) {
    this.config.callbacks.onCallState({ ...session.snapshot })
  }

  private requireSession(callId: string) {
    const session = this.sessions.get(callId)
    if (!session || session.ended) throw new Error('Звонок уже завершён')
    return session
  }

  private requireActiveSession(callId: string) {
    const session = this.requireSession(callId)
    if (session.snapshot.state !== 'active') {
      throw new Error('Нет активного разговора')
    }
    return session
  }

  private assertOnline() {
    if (
      !this.loggedIn ||
      !this.socket ||
      this.socket.readyState !== WebSocket.OPEN
    ) {
      throw new Error('Софтфон не зарегистрирован в onlinePBX')
    }
  }

  private sendRpcResult(id: string | number, result: unknown) {
    if (this.socket?.readyState !== WebSocket.OPEN) return
    this.socket.send(serializeJsonRpcResult(id, result))
  }

  private sendRpcError(id: string | number, code: number, message: string) {
    if (this.socket?.readyState !== WebSocket.OPEN) return
    this.socket.send(serializeJsonRpcError(id, code, message))
  }

  private handleSocketClose(event: CloseEvent) {
    this.clearConnectTimer()
    this.loggedIn = false
    this.socket = null
    this.rejectPendingRequests(
      new Error(`WebSocket закрыт с кодом ${event.code}`),
    )

    for (const session of [...this.sessions.values()]) {
      this.endSession(
        session,
        session.snapshot.establishedAt ? 'answered' : 'failed',
      )
    }

    if (this.intentionalClose || this.suppressNextCloseState) {
      this.suppressNextCloseState = false
      return
    }
    const message = getVertoSocketCloseMessage(event.code)
    if (this.connectReject) {
      this.failConnect(
        new Error(
          message ??
            'Соединение с onlinePBX Verto закрыто до завершения авторизации',
        ),
      )
    } else {
      this.config.callbacks.onConnectionState('offline', message)
    }
  }

  private failConnect(error: Error, retryable = true) {
    this.clearConnectTimer()
    this.suppressNextCloseState = true
    this.connectReject?.(error)
    this.connectResolve = null
    this.connectReject = null
    this.connectPromise = null
    this.config.callbacks.onConnectionState(
      'error',
      error.message,
      retryable,
    )
  }

  private clearConnectTimer() {
    if (this.connectTimer != null) {
      window.clearTimeout(this.connectTimer)
      this.connectTimer = null
    }
  }

  private rejectPendingRequests(error: Error) {
    for (const request of this.pendingRequests.values()) {
      window.clearTimeout(request.timeout)
      request.reject(error)
    }
    this.pendingRequests.clear()
  }
}

export function createVertoTransport(config: VoipTransportConfig) {
  return new VertoTransport(config)
}
