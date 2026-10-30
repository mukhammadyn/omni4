/* Перенесено из new-crm (professio_app_69f844, src/components/softphone/transports/vertoProtocol.ts, коммит 241a32e9): транспорт проверен вживую на onlinePBX. Правки — только под строгий TypeScript omni4. */
import type {
  VoipCallDirection,
  VoipCallOutcome,
} from './types'

export type VertoLoginFailure =
  | 'password_rejected'
  | 'login_not_found'
  | 'authentication_rejected'
  | 'other'

export interface VertoRemoteIdentity {
  number: string
  name: string
}

export interface VertoDialogParams {
  callID: string
  destination_number: string
  caller_id_name: string
  caller_id_number: string
  remote_caller_id_name: string
  remote_caller_id_number: string
  login: string
  useVideo: false
  useStereo: false
  callee_id_name?: string | undefined
  callee_id_number?: string | undefined
  display_direction?: string | undefined
}

export function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

export function asString(value: unknown) {
  return typeof value === 'string' ? value : ''
}

export function getVertoCallId(params: Record<string, unknown>) {
  const dialogParams = asRecord(params.dialogParams)
  return asString(dialogParams.callID) || asString(params.callID)
}

export function getVertoRemoteIdentity(
  params: Record<string, unknown>,
): VertoRemoteIdentity {
  const dialogParams = asRecord(params.dialogParams)
  const source =
    Object.keys(dialogParams).length > 0 ? dialogParams : params
  const displayDirection = asString(source.display_direction)
  const directionalNumber =
    displayDirection === 'outbound'
      ? asString(source.caller_id_number)
      : asString(source.callee_id_number)
  const directionalName =
    displayDirection === 'outbound'
      ? asString(source.caller_id_name)
      : asString(source.callee_id_name)

  return {
    number:
      asString(source.remote_caller_id_number) ||
      directionalNumber ||
      asString(source.caller_id_number) ||
      asString(params.display_number) ||
      asString(params.caller_id_number) ||
      'Неизвестный номер',
    name:
      asString(source.remote_caller_id_name) ||
      directionalName ||
      asString(source.caller_id_name) ||
      asString(params.display_name),
  }
}

export function getVertoRemoteSdp(params: Record<string, unknown>) {
  return asString(params.sdp)
}

export function mapVertoCauseToOutcome(input: {
  established: boolean
  direction: VoipCallDirection
  cause: string
}): VoipCallOutcome {
  if (input.established) return 'answered'

  const normalized = input.cause.toUpperCase()
  if (normalized.includes('BUSY')) return 'busy'
  if (
    normalized.includes('NO_ANSWER') ||
    normalized.includes('NO_USER_RESPONSE') ||
    normalized.includes('ORIGINATOR_CANCEL') ||
    normalized.includes('CALL_REJECTED')
  ) {
    return 'no_answer'
  }
  if (normalized.includes('NORMAL_CLEARING')) {
    return input.direction === 'outgoing' ? 'canceled' : 'no_answer'
  }
  return 'failed'
}

export function classifyVertoLoginFailure(message: string): VertoLoginFailure {
  const normalized = message.toLowerCase()
  if (normalized.includes('authentication failure')) {
    return 'password_rejected'
  }
  if (normalized.includes('login incorrect')) {
    return 'login_not_found'
  }
  if (normalized.includes('-32001')) {
    return 'authentication_rejected'
  }
  return 'other'
}

export function getVertoSocketCloseMessage(code: number) {
  if (code === 1000) return undefined
  if (code === 1006) {
    return 'Соединение с onlinePBX Verto неожиданно закрыто'
  }
  return `Соединение с onlinePBX Verto закрыто (код ${code})`
}

export function createVertoLoginParams(input: {
  login: string
  password: string
  sessionId: string
}) {
  return {
    login: input.login,
    passwd: input.password,
    sessid: input.sessionId,
    loginParams: {},
    userVariables: {},
  }
}

export function createVertoDialogParams(input: {
  callId: string
  destination: string
  login: string
  extension: string
  displayName?: string | undefined
  remoteName: string
}): VertoDialogParams {
  const callerName = input.displayName || input.extension
  return {
    callID: input.callId,
    destination_number: input.destination,
    caller_id_name: callerName,
    caller_id_number: input.extension,
    remote_caller_id_name: input.remoteName,
    remote_caller_id_number: input.destination,
    login: input.login,
    useVideo: false,
    useStereo: false,
  }
}

export function serializeJsonRpcRequest(input: {
  id: number
  method: string
  params: Record<string, unknown>
}) {
  return JSON.stringify({
    jsonrpc: '2.0',
    id: input.id,
    method: input.method,
    params: input.params,
  })
}

export function serializeJsonRpcResult(
  id: string | number,
  result: unknown,
) {
  return JSON.stringify({ jsonrpc: '2.0', id, result })
}

export function serializeJsonRpcError(
  id: string | number,
  code: number,
  message: string,
) {
  return JSON.stringify({
    jsonrpc: '2.0',
    id,
    error: { code, message },
  })
}

export function parseJsonRpcMessages(raw: unknown) {
  if (typeof raw !== 'string') return []

  try {
    const parsed: unknown = JSON.parse(raw)
    const values = Array.isArray(parsed) ? parsed : [parsed]
    return values
      .map(asRecord)
      .filter((message) => Object.keys(message).length > 0)
  } catch {
    return []
  }
}
