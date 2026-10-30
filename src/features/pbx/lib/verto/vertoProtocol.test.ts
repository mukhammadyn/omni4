import { test } from "vitest";
import assert from 'node:assert/strict'
import {
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
} from './vertoProtocol'

/* Перенесено из new-crm (там — node:test без раннера); проверки те же. */
test("verto protocol", () => {

assert.equal(
  classifyVertoLoginFailure('Authentication Failure (-32001)'),
  'password_rejected',
)
assert.equal(
  classifyVertoLoginFailure('Login Incorrect (-32001)'),
  'login_not_found',
)
assert.equal(
  classifyVertoLoginFailure('Credentials rejected (-32001)'),
  'authentication_rejected',
)
assert.equal(classifyVertoLoginFailure('WebSocket closed'), 'other')
assert.equal(getVertoSocketCloseMessage(1000), undefined)
assert.equal(
  getVertoSocketCloseMessage(1006),
  'Соединение с onlinePBX Verto неожиданно закрыто',
)
assert.equal(
  getVertoSocketCloseMessage(1011),
  'Соединение с onlinePBX Verto закрыто (код 1011)',
)

const loginParams = createVertoLoginParams({
  login: '100@example.onpbx.ru',
  password: 'test-password',
  sessionId: 'session-1',
})
assert.deepEqual(loginParams, {
  login: '100@example.onpbx.ru',
  passwd: 'test-password',
  sessid: 'session-1',
  loginParams: {},
  userVariables: {},
})
assert.equal('password' in loginParams, false)

const loginWire = serializeJsonRpcRequest({
  id: 1,
  method: 'login',
  params: loginParams,
})
assert.deepEqual(JSON.parse(loginWire), {
  jsonrpc: '2.0',
  id: 1,
  method: 'login',
  params: loginParams,
})

const dialogParams = createVertoDialogParams({
  callId: 'call-1',
  destination: '101',
  login: '100@example.onpbx.ru',
  extension: '100',
  displayName: 'Operator',
  remoteName: 'Outbound Call',
})
assert.deepEqual(dialogParams, {
  callID: 'call-1',
  destination_number: '101',
  caller_id_name: 'Operator',
  caller_id_number: '100',
  remote_caller_id_name: 'Outbound Call',
  remote_caller_id_number: '101',
  login: '100@example.onpbx.ru',
  useVideo: false,
  useStereo: false,
})

assert.equal(getVertoCallId({ callID: 'flat-id' }), 'flat-id')
assert.equal(
  getVertoCallId({ dialogParams: { callID: 'nested-id' } }),
  'nested-id',
)
assert.equal(getVertoCallId({}), '')
assert.equal(getVertoRemoteSdp({ sdp: 'v=0\r\n' }), 'v=0\r\n')

assert.deepEqual(
  getVertoRemoteIdentity({
    callID: 'incoming-1',
    display_direction: 'inbound',
    caller_id_name: 'Internal route',
    caller_id_number: '000',
    callee_id_name: 'Client',
    callee_id_number: '+998901234567',
  }),
  { name: 'Client', number: '+998901234567' },
)

assert.deepEqual(
  getVertoRemoteIdentity({
    dialogParams: {
      display_direction: 'outbound',
      caller_id_name: 'Caller',
      caller_id_number: '102',
      callee_id_name: 'Ignored',
      callee_id_number: '999',
    },
  }),
  { name: 'Caller', number: '102' },
)

assert.deepEqual(
  getVertoRemoteIdentity({
    remote_caller_id_name: 'Explicit name',
    remote_caller_id_number: '103',
  }),
  { name: 'Explicit name', number: '103' },
)
assert.deepEqual(getVertoRemoteIdentity({}), {
  name: '',
  number: 'Неизвестный номер',
})

assert.equal(
  mapVertoCauseToOutcome({
    established: true,
    direction: 'outgoing',
    cause: 'NETWORK_OUT_OF_ORDER',
  }),
  'answered',
)
assert.equal(
  mapVertoCauseToOutcome({
    established: false,
    direction: 'outgoing',
    cause: 'USER_BUSY',
  }),
  'busy',
)
assert.equal(
  mapVertoCauseToOutcome({
    established: false,
    direction: 'incoming',
    cause: 'CALL_REJECTED',
  }),
  'no_answer',
)
assert.equal(
  mapVertoCauseToOutcome({
    established: false,
    direction: 'outgoing',
    cause: 'NORMAL_CLEARING',
  }),
  'canceled',
)
assert.equal(
  mapVertoCauseToOutcome({
    established: false,
    direction: 'incoming',
    cause: 'NORMAL_CLEARING',
  }),
  'no_answer',
)
assert.equal(
  mapVertoCauseToOutcome({
    established: false,
    direction: 'outgoing',
    cause: 'NETWORK_OUT_OF_ORDER',
  }),
  'failed',
)

assert.deepEqual(
  parseJsonRpcMessages(
    JSON.stringify({
      jsonrpc: '2.0',
      id: 7,
      method: 'verto.ping',
      params: {},
    }),
  ),
  [
    {
      jsonrpc: '2.0',
      id: 7,
      method: 'verto.ping',
      params: {},
    },
  ],
)
assert.equal(
  parseJsonRpcMessages(
    JSON.stringify([{ jsonrpc: '2.0', id: 1 }, { jsonrpc: '2.0', id: 2 }]),
  ).length,
  2,
)
assert.deepEqual(parseJsonRpcMessages('not-json'), [])
assert.deepEqual(parseJsonRpcMessages(new ArrayBuffer(0)), [])

assert.deepEqual(
  JSON.parse(serializeJsonRpcResult('server-id', { method: 'verto.invite' })),
  {
    jsonrpc: '2.0',
    id: 'server-id',
    result: { method: 'verto.invite' },
  },
)
assert.deepEqual(
  JSON.parse(serializeJsonRpcError('server-id', -32601, 'Unsupported')),
  {
    jsonrpc: '2.0',
    id: 'server-id',
    error: { code: -32601, message: 'Unsupported' },
  },
)

console.log('vertoProtocol: ok')

});
